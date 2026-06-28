from __future__ import annotations
"""
Builds NRB statistical reports in Excel, PDF, Word, and CSV formats.

Each report follows the format used by NRB:
  - Region header row (highlighted)
  - County data rows: NPR (M/F/T) | OTHERS (M/F/T) | GRAND TOTAL
  - Region subtotal row
  - Grand total row at the bottom
"""
import csv
import io
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak,
)
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ── Palette ───────────────────────────────────────────────────────────────────
_DARK_BLUE    = "1F4E79"
_MID_BLUE     = "2E75B6"
_REGION_BG    = "BF338C"   # magenta — matches the screenshot
_REGION_FG    = "FFFFFF"
_TOTAL_ROW_BG = "D9D9D9"
_HEADER_BG    = "1F4E79"
_HEADER_FG    = "FFFFFF"
_ALT_BG       = "EBF3FB"
_WHITE        = "FFFFFF"

# ── Module definitions ────────────────────────────────────────────────────────
NRB_CATS = ("npr", "replacements", "changes", "duplicates", "type4", "type5")
OTHERS_CATS = ("replacements", "changes", "duplicates", "type4", "type5")

MODULES = [
    ("app", "APPLICATIONS SENT TO HEADQUARTERS"),
    ("ids", "IDs RECEIVED FROM HEADQUARTERS"),
    ("rej", "REJECTIONS FROM HEADQUARTERS"),
]

# ── Data helpers ──────────────────────────────────────────────────────────────

def _sum_others(row: dict, prefix: str) -> tuple[int, int]:
    """Return (male, female) sum for all non-NPR categories."""
    m = sum(row.get(f"{prefix}_{c}_male", 0) for c in OTHERS_CATS)
    f = sum(row.get(f"{prefix}_{c}_female", 0) for c in OTHERS_CATS)
    return m, f


def build_region_county_data(
    submissions: list,
    station_lookup: dict,  # {station_id: Station}
    year: int,
    month: "int | None" = None,
) -> dict:
    """
    Aggregate approved submissions into a nested dict:
      {module_prefix: {region: {county: {npr_m, npr_f, oth_m, oth_f, ...}}}}
    """
    # Initialise structure
    data: dict[str, dict[str, dict[str, dict[str, int]]]] = {}
    for prefix, _ in MODULES:
        data[prefix] = {}

    for sub in submissions:
        station = station_lookup.get(sub.station_id)
        if not station:
            continue
        region = station.region
        county = station.county

        for prefix, _ in MODULES:
            data[prefix].setdefault(region, {}).setdefault(county, {
                "npr_m": 0, "npr_f": 0,
                "oth_m": 0, "oth_f": 0,
            })
            d = data[prefix][region][county]
            d["npr_m"] += getattr(sub, f"{prefix}_npr_male", 0)
            d["npr_f"] += getattr(sub, f"{prefix}_npr_female", 0)
            om, of_ = _sum_others(sub.__dict__, prefix)
            d["oth_m"] += om
            d["oth_f"] += of_

    return data


def _period_label(year: int, month: "int | None") -> str:
    months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
    if month:
        return f"{months[month - 1]} {year}"
    return f"JAN – DEC {year}"


# ── Shared table-data builder ─────────────────────────────────────────────────

def _module_table_rows(
    region_data: dict[str, dict[str, dict[str, int]]],
) -> list[list]:
    """
    Returns rows ready to write into any format:
      Each entry is a dict with _type ('region'|'county'|'subtotal'|'grand') + values.
    """
    rows = []
    g = {"npr_m": 0, "npr_f": 0, "oth_m": 0, "oth_f": 0}

    for region in sorted(region_data):
        rows.append({"_type": "region", "label": f"{region} REGION"})
        rt = {"npr_m": 0, "npr_f": 0, "oth_m": 0, "oth_f": 0}

        for county in sorted(region_data[region]):
            d = region_data[region][county]
            rows.append({
                "_type": "county",
                "label": f"{county} COUNTY",
                **d,
            })
            for k in rt:
                rt[k] += d[k]
                g[k]  += d[k]

        rt["_type"]  = "subtotal"
        rt["label"]  = f"{region} REGION TOTALS"
        rows.append(rt)

    g["_type"] = "grand"
    g["label"] = "GRAND TOTAL"
    rows.append(g)
    return rows


# ── Excel ──────────────────────────────────────────────────────────────────────

def _xl_cell_style(ws, row, col, value, fill=None, font=None, align="center", border=None):
    c = ws.cell(row=row, column=col, value=value)
    if fill:
        c.fill = fill
    if font:
        c.font = font
    if border:
        c.border = border
    c.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)
    return c


def build_excel_report(
    title: str,
    year: int,
    month: "int | None",
    data: dict,
) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)  # remove default sheet

    thin = Side(style="thin", color="BBBBBB")
    med  = Side(style="medium", color="888888")
    border_thin = Border(left=thin, right=thin, top=thin, bottom=thin)
    border_med  = Border(left=med,  right=med,  top=med,  bottom=med)

    hdr_fill     = PatternFill(start_color=_HEADER_BG,  end_color=_HEADER_BG,  fill_type="solid")
    region_fill  = PatternFill(start_color=_REGION_BG,  end_color=_REGION_BG,  fill_type="solid")
    sub_fill     = PatternFill(start_color=_TOTAL_ROW_BG,end_color=_TOTAL_ROW_BG,fill_type="solid")
    grand_fill   = PatternFill(start_color="595959",    end_color="595959",    fill_type="solid")
    alt_fill     = PatternFill(start_color=_ALT_BG,     end_color=_ALT_BG,     fill_type="solid")

    hdr_font     = Font(bold=True, color=_HEADER_FG, size=9)
    region_font  = Font(bold=True, color=_REGION_FG, size=9)
    sub_font     = Font(bold=True, size=9)
    grand_font   = Font(bold=True, color="FFFFFF", size=9)
    data_font    = Font(size=9)

    period = _period_label(year, month)
    COLS = ["LIST OF COUNTIES", "M", "F", "TOTAL", "M", "F", "TOTAL", "GRAND\nTOTAL"]

    for prefix, module_title in MODULES:
        ws = wb.create_sheet(title=module_title[:31])
        ws.sheet_view.showGridLines = False

        # ── Row 1: Report title ──
        ws.merge_cells("A1:H1")
        c = ws.cell(row=1, column=1, value=f"{module_title} FROM {period}")
        c.font = Font(bold=True, size=12, color=_HEADER_FG)
        c.fill = hdr_fill
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 24

        # ── Row 2: blank ──
        ws.row_dimensions[2].height = 6

        # ── Row 3: Group headers ──
        ws.merge_cells("B3:D3")
        ws.merge_cells("E3:G3")
        for col, label, clr in [
            (2, "NPR",        "2E75B6"),
            (5, "DUP/OTHERS", "70AD47"),
        ]:
            c = ws.cell(row=3, column=col, value=label)
            c.font = Font(bold=True, color="FFFFFF", size=9)
            c.fill = PatternFill(start_color=clr, end_color=clr, fill_type="solid")
            c.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[3].height = 18

        # ── Row 4: Column headers ──
        for ci, lbl in enumerate(COLS, start=1):
            c = ws.cell(row=4, column=ci, value=lbl)
            c.font  = hdr_font
            c.fill  = hdr_fill
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = border_thin
        ws.row_dimensions[4].height = 28

        # Column widths
        ws.column_dimensions["A"].width = 32
        for col_letter in ["B","C","D","E","F","G","H"]:
            ws.column_dimensions[col_letter].width = 10

        # ── Data rows ──
        rows = _module_table_rows(data.get(prefix, {}))
        ri = 5
        for i, row in enumerate(rows):
            rtype = row["_type"]

            if rtype == "region":
                ws.merge_cells(start_row=ri, start_column=1, end_row=ri, end_column=8)
                c = ws.cell(row=ri, column=1, value=row["label"])
                c.font   = region_font
                c.fill   = region_fill
                c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
                ws.row_dimensions[ri].height = 16
                ri += 1
                continue

            is_sub   = rtype == "subtotal"
            is_grand = rtype == "grand"
            fill  = grand_fill if is_grand else (sub_fill if is_sub else (alt_fill if i % 2 == 0 else None))
            font_ = grand_font if is_grand else (sub_font if is_sub else data_font)
            fg    = "FFFFFF" if is_grand else "000000"

            npr_m = row.get("npr_m", 0)
            npr_f = row.get("npr_f", 0)
            oth_m = row.get("oth_m", 0)
            oth_f = row.get("oth_f", 0)
            grand = npr_m + npr_f + oth_m + oth_f

            vals = [
                (row["label"], "left"),
                (npr_m,  "right"), (npr_f,  "right"), (npr_m  + npr_f,  "right"),
                (oth_m,  "right"), (oth_f,  "right"), (oth_m  + oth_f,  "right"),
                (grand,  "right"),
            ]
            for ci, (val, align) in enumerate(vals, start=1):
                c = ws.cell(row=ri, column=ci, value=val)
                c.font = font_
                if fill:
                    c.fill = fill
                c.alignment = Alignment(horizontal=align, vertical="center")
                c.border = border_thin
                if isinstance(val, int):
                    c.number_format = "#,##0"
            ws.row_dimensions[ri].height = 15
            ri += 1

        ws.freeze_panes = "A5"

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ── CSV ────────────────────────────────────────────────────────────────────────

def build_csv_report(
    year: int,
    month: "int | None",
    data: dict,
) -> bytes:
    period = _period_label(year, month)
    buf = io.StringIO()
    w   = csv.writer(buf)

    for prefix, module_title in MODULES:
        w.writerow([f"{module_title} FROM {period}"])
        w.writerow(["County", "NPR M", "NPR F", "NPR Total",
                    "DUP/Others M", "DUP/Others F", "DUP/Others Total", "Grand Total"])
        for row in _module_table_rows(data.get(prefix, {})):
            if row["_type"] == "region":
                w.writerow([row["label"]])
                continue
            nm, nf = row.get("npr_m", 0), row.get("npr_f", 0)
            om, of_ = row.get("oth_m", 0), row.get("oth_f", 0)
            w.writerow([
                row["label"], nm, nf, nm + nf,
                om, of_, om + of_,
                nm + nf + om + of_,
            ])
        w.writerow([])

    return buf.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility


# ── PDF ────────────────────────────────────────────────────────────────────────

def build_pdf_report(
    year: int,
    month: "int | None",
    data: dict,
    org_name: str = "National Registration Bureau",
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm,  bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    period = _period_label(year, month)

    c_hdr    = colors.HexColor(f"#{_HEADER_BG}")
    c_region = colors.HexColor(f"#{_REGION_BG}")
    c_sub    = colors.HexColor("#D9D9D9")
    c_grand  = colors.HexColor("#595959")
    c_alt    = colors.HexColor("#EBF3FB")
    c_blu    = colors.HexColor("#2E75B6")
    c_grn    = colors.HexColor("#70AD47")

    story = []

    for pi, (prefix, module_title) in enumerate(MODULES):
        if pi > 0:
            story.append(PageBreak())

        # Title block
        title_style = ParagraphStyle(
            "rptTitle",
            fontSize=12, fontName="Helvetica-Bold",
            textColor=colors.white,
            backColor=c_hdr,
            alignment=1,
            spaceBefore=0, spaceAfter=4,
            borderPad=6,
        )
        story.append(Paragraph(f"{module_title} FROM {period}", title_style))
        story.append(Spacer(1, 0.3 * cm))

        rows_data = _module_table_rows(data.get(prefix, {}))

        # Table header
        header_row1 = ["LIST OF COUNTIES",
                       Paragraph("<b>NPR</b>",       ParagraphStyle("", fontSize=7, textColor=colors.white, alignment=1)),
                       "", "",
                       Paragraph("<b>DUP/OTHERS</b>", ParagraphStyle("", fontSize=7, textColor=colors.white, alignment=1)),
                       "", "", "GRAND\nTOTAL"]
        header_row2 = ["", "M", "F", "TOTAL", "M", "F", "TOTAL", ""]

        tbl_data = [header_row1, header_row2]
        tbl_style_cmds = [
            # Header row 1
            ("BACKGROUND",   (0, 0), (-1, 0),  c_hdr),
            ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, 0),  7),
            ("ALIGN",        (0, 0), (-1, 0),  "CENTER"),
            ("VALIGN",       (0, 0), (-1, 0),  "MIDDLE"),
            # NPR group header span
            ("BACKGROUND",   (1, 0), (3, 0),   c_blu),
            ("SPAN",         (1, 0), (3, 0)),
            # DUP/OTHERS group header span
            ("BACKGROUND",   (4, 0), (6, 0),   c_grn),
            ("SPAN",         (4, 0), (6, 0)),
            # Header row 2
            ("BACKGROUND",   (0, 1), (-1, 1),  c_hdr),
            ("TEXTCOLOR",    (0, 1), (-1, 1),  colors.white),
            ("FONTNAME",     (0, 1), (-1, 1),  "Helvetica-Bold"),
            ("FONTSIZE",     (0, 1), (-1, 1),  7),
            ("ALIGN",        (0, 1), (-1, 1),  "CENTER"),
            # General
            ("FONTSIZE",     (0, 2), (-1, -1), 7),
            ("ALIGN",        (1, 2), (-1, -1), "RIGHT"),
            ("ALIGN",        (0, 2), (0, -1),  "LEFT"),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("GRID",         (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
            ("TOPPADDING",   (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
        ]

        row_offset = 2
        for i, row in enumerate(rows_data):
            rtype = row["_type"]

            if rtype == "region":
                tbl_data.append([row["label"], "", "", "", "", "", "", ""])
                r = row_offset + i
                tbl_style_cmds += [
                    ("SPAN",       (0, r), (-1, r)),
                    ("BACKGROUND", (0, r), (-1, r), c_region),
                    ("TEXTCOLOR",  (0, r), (-1, r), colors.white),
                    ("FONTNAME",   (0, r), (-1, r), "Helvetica-Bold"),
                ]
                continue

            nm, nf = row.get("npr_m", 0), row.get("npr_f", 0)
            om, of_ = row.get("oth_m", 0), row.get("oth_f", 0)
            grand = nm + nf + om + of_
            tbl_data.append([
                row["label"],
                f"{nm:,}", f"{nf:,}", f"{nm+nf:,}",
                f"{om:,}", f"{of_:,}", f"{om+of_:,}",
                f"{grand:,}",
            ])
            r = row_offset + i
            if rtype == "subtotal":
                tbl_style_cmds += [
                    ("BACKGROUND", (0, r), (-1, r), c_sub),
                    ("FONTNAME",   (0, r), (-1, r), "Helvetica-Bold"),
                ]
            elif rtype == "grand":
                tbl_style_cmds += [
                    ("BACKGROUND", (0, r), (-1, r), c_grand),
                    ("TEXTCOLOR",  (0, r), (-1, r), colors.white),
                    ("FONTNAME",   (0, r), (-1, r), "Helvetica-Bold"),
                ]
            elif i % 2 == 0:
                tbl_style_cmds += [("BACKGROUND", (0, r), (-1, r), c_alt)]

        pw = landscape(A4)[0] - 3 * cm
        col_widths = [pw * 0.28] + [pw * 0.72 / 7] * 7

        tbl = Table(tbl_data, colWidths=col_widths, repeatRows=2)
        tbl.setStyle(TableStyle(tbl_style_cmds))
        story.append(tbl)

        from datetime import date
        footer = ParagraphStyle("footer", fontSize=7, textColor=colors.grey, alignment=1, spaceBefore=4)
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(f"{org_name} · Generated {date.today().strftime('%d %B %Y')}", footer))

    doc.build(story)
    return buffer.getvalue()


# ── Word ───────────────────────────────────────────────────────────────────────

def _set_cell_bg(cell, hex_color: str):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def _cell_text(cell, text: str, bold=False, size=7, color_hex=None,
               align=WD_ALIGN_PARAGRAPH.LEFT, font_name=None):
    cell.text = ""
    para = cell.paragraphs[0]
    para.alignment = align
    run = para.add_run(str(text))
    run.bold = bold
    run.font.size = Pt(size)
    if font_name:
        run.font.name = font_name
    if color_hex:
        r, g, b = int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)
        run.font.color.rgb = RGBColor(r, g, b)


def build_word_report(
    year: int,
    month: "int | None",
    data: dict,
) -> bytes:
    doc = Document()
    section = doc.sections[0]
    # Landscape
    section.orientation = 1
    section.page_width, section.page_height = section.page_height, section.page_width
    section.left_margin = section.right_margin = Inches(0.5)
    section.top_margin  = section.bottom_margin = Inches(0.5)

    period = _period_label(year, month)

    for pi, (prefix, module_title) in enumerate(MODULES):
        if pi > 0:
            doc.add_page_break()

        # Title
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(f"{module_title} FROM {period}")
        run.bold = True
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        from docx.oxml import OxmlElement as OE
        pPr = p._p.get_or_add_pPr()
        shd = OE("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), _HEADER_BG)
        pPr.append(shd)

        # Table: 2 header rows + data rows
        rows_data = _module_table_rows(data.get(prefix, {}))
        nrows = 2 + len(rows_data)
        table = doc.add_table(rows=nrows, cols=8)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.style = "Table Grid"

        # Set column widths
        from docx.oxml.ns import qn as _qn
        tbl_el = table._tbl
        tblPr = tbl_el.find(_qn("w:tblPr"))
        if tblPr is None:
            tblPr = OxmlElement("w:tblPr")
            tbl_el.insert(0, tblPr)
        tblW = OxmlElement("w:tblW")
        tblW.set(_qn("w:type"), "auto")
        tblW.set(_qn("w:w"), "0")
        tblPr.append(tblW)

        col_pcts = [28, 9, 9, 10, 9, 9, 10, 16]

        def set_col_w(cell, pct):
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            tcW = OxmlElement("w:tcW")
            tcW.set(_qn("w:type"), "pct")
            tcW.set(_qn("w:w"), str(pct * 50))
            tcPr.append(tcW)

        # Header row 1: group labels
        h1 = table.rows[0]
        _cell_text(h1.cells[0], "LIST OF COUNTIES", bold=True, size=7, color_hex=_HEADER_FG,
                   align=WD_ALIGN_PARAGRAPH.CENTER)
        _set_cell_bg(h1.cells[0], _HEADER_BG)
        # Merge NPR group
        h1.cells[1].merge(h1.cells[3])
        _cell_text(h1.cells[1], "NPR", bold=True, size=7, color_hex="FFFFFF",
                   align=WD_ALIGN_PARAGRAPH.CENTER)
        _set_cell_bg(h1.cells[1], "2E75B6")
        # Merge DUP group
        h1.cells[4].merge(h1.cells[6])
        _cell_text(h1.cells[4], "DUP/OTHERS", bold=True, size=7, color_hex="FFFFFF",
                   align=WD_ALIGN_PARAGRAPH.CENTER)
        _set_cell_bg(h1.cells[4], "70AD47")
        _cell_text(h1.cells[7], "GRAND\nTOTAL", bold=True, size=7, color_hex=_HEADER_FG,
                   align=WD_ALIGN_PARAGRAPH.CENTER)
        _set_cell_bg(h1.cells[7], _HEADER_BG)

        # Header row 2: M/F/TOTAL labels
        h2 = table.rows[1]
        labels2 = ["", "M", "F", "TOTAL", "M", "F", "TOTAL", ""]
        for ci, lbl in enumerate(labels2):
            _cell_text(h2.cells[ci], lbl, bold=True, size=7, color_hex=_HEADER_FG,
                       align=WD_ALIGN_PARAGRAPH.CENTER)
            _set_cell_bg(h2.cells[ci], _HEADER_BG)

        # Data rows
        for ri, row in enumerate(rows_data, start=2):
            trow = table.rows[ri]
            rtype = row["_type"]

            if rtype == "region":
                trow.cells[0].merge(trow.cells[7])
                _cell_text(trow.cells[0], row["label"], bold=True, size=7, color_hex=_REGION_FG)
                _set_cell_bg(trow.cells[0], _REGION_BG)
                continue

            nm, nf = row.get("npr_m", 0), row.get("npr_f", 0)
            om, of_ = row.get("oth_m", 0), row.get("oth_f", 0)
            grand = nm + nf + om + of_
            is_sub   = rtype == "subtotal"
            is_grand = rtype == "grand"
            bg = "595959" if is_grand else (_TOTAL_ROW_BG if is_sub else None)
            fg = "FFFFFF" if is_grand else "000000"

            vals = [row["label"], nm, nf, nm+nf, om, of_, om+of_, grand]
            aligns = [WD_ALIGN_PARAGRAPH.LEFT] + [WD_ALIGN_PARAGRAPH.RIGHT] * 7
            for ci, (val, align) in enumerate(zip(vals, aligns)):
                text = f"{val:,}" if isinstance(val, int) else str(val)
                _cell_text(trow.cells[ci], text, bold=is_sub or is_grand,
                           size=7, color_hex=fg, align=align)
                if bg:
                    _set_cell_bg(trow.cells[ci], bg)

        doc.add_paragraph()

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


# ── Usajili Mashinani (mobile registration) reports ─────────────────────────────
# Styled to match the field "Usajili Performance ... T1.xlsx" template: plain
# white background, Times New Roman, thin black borders, a light-gray header
# band, and the same two accent colors the field template uses for its two
# application channels — red for Live Capture, amber for Manual. No dark
# theme, no row striping — kept deliberately plain/professional.
# `data` is the dict returned by `_mobile_summary_data()` in the reports endpoint:
#   {"breakdown": [...], "county_totals": [...], "totals": {...}}

_MOBILE_FONT  = "Times New Roman"
_MOBILE_GRAY  = "D9D9D9"   # column header band
_MOBILE_RED   = "FF0000"   # Live Capture accent (matches the field template)
_MOBILE_AMBER = "FFC000"   # Manual accent (matches the field template)


def _mobile_period_text(year: int, month: "int | None", quarter: "int | None") -> str:
    if month:
        months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"]
        return f"{months[month - 1]} {year}"
    if quarter:
        qmonths = {1: "JAN – MAR", 2: "APR – JUN", 3: "JUL – SEP", 4: "OCT – DEC"}
        return f"Q{quarter} {year} ({qmonths[quarter]})"
    return f"FULL YEAR {year} (JAN – DEC)"


def build_mobile_excel_report(data: dict, year: int, month: "int | None", quarter: "int | None") -> bytes:
    wb = Workbook()
    period = _mobile_period_text(year, month, quarter)

    gray_fill = PatternFill(start_color=_MOBILE_GRAY, end_color=_MOBILE_GRAY, fill_type="solid")
    red_fill  = PatternFill(start_color=_MOBILE_RED,  end_color=_MOBILE_RED,  fill_type="solid")
    amber_fill = PatternFill(start_color=_MOBILE_AMBER, end_color=_MOBILE_AMBER, fill_type="solid")
    title_font = Font(name=_MOBILE_FONT, bold=True, size=16)
    subtitle_font = Font(name=_MOBILE_FONT, bold=True, size=13)
    period_font = Font(name=_MOBILE_FONT, bold=True, size=13)
    hdr_font   = Font(name=_MOBILE_FONT, bold=True, size=11)
    grand_font = Font(name=_MOBILE_FONT, bold=True, size=11)
    data_font  = Font(name=_MOBILE_FONT, size=11)
    thin = Side(style="thin", color="000000")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    def write_title_block(ws, last_col_letter: str):
        ws.merge_cells(f"A1:{last_col_letter}1")
        c = ws.cell(row=1, column=1, value="NATIONAL REGISTRATION BUREAU")
        c.font = title_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.merge_cells(f"A2:{last_col_letter}2")
        c = ws.cell(row=2, column=1, value="USAJILI MASHINANI — MOBILE REGISTRATION REPORT")
        c.font = subtitle_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.merge_cells(f"A3:{last_col_letter}3")
        c = ws.cell(row=3, column=1, value=period)
        c.font = period_font
        c.alignment = Alignment(horizontal="center", vertical="center")

    # ── Sheet 1: Target vs Achievement by County ──
    ws1 = wb.active
    ws1.title = "Target vs Achievement"
    write_title_block(ws1, "D")

    cols1 = ["County", "Target", "Registered", "Achievement %"]
    for ci, lbl in enumerate(cols1, start=1):
        cell = ws1.cell(row=5, column=ci, value=lbl)
        cell.font = hdr_font
        cell.fill = gray_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border
    ws1.column_dimensions["A"].width = 24
    for col_letter in ("B", "C", "D"):
        ws1.column_dimensions[col_letter].width = 16

    ri = 6
    for row in data["county_totals"]:
        vals = [row["county"], row["target_set"], row["total_registered"], row["target_achievement_pct"]]
        for ci, val in enumerate(vals, start=1):
            cell = ws1.cell(row=ri, column=ci, value=val)
            cell.font = data_font
            cell.border = border
            cell.alignment = Alignment(horizontal="left" if ci == 1 else "right", vertical="center")
        ri += 1

    t = data["totals"]
    vals = ["GRAND TOTAL", t["target_set"], t["total_registered"], t["target_achievement_pct"]]
    for ci, val in enumerate(vals, start=1):
        cell = ws1.cell(row=ri, column=ci, value=val)
        cell.font = grand_font
        cell.border = border
        cell.alignment = Alignment(horizontal="left" if ci == 1 else "right", vertical="center")

    # ── Sheet 2: Registration Volume by County & Subcounty ──
    # Mirrors the field template's own breakdown exactly: Live Capture vs Manual,
    # each split into NPR (Initial) and Replacement ("Duplicate") applications, by M/F.
    ws2 = wb.create_sheet("Registration Volume")
    write_title_block(ws2, "Q")

    def hdr_cell(ws, row, col, value, fill):
        cell = ws.cell(row=row, column=col, value=value)
        cell.font = hdr_font
        cell.fill = fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
        return cell

    # Row 5: top-level groups (rowspan 3 for County/Subcounty/Total Registered)
    ws2.merge_cells("A5:A7"); hdr_cell(ws2, 5, 1, "County", gray_fill)
    ws2.merge_cells("B5:B7"); hdr_cell(ws2, 5, 2, "Subcounty", gray_fill)
    ws2.merge_cells("C5:I5"); hdr_cell(ws2, 5, 3, "LIVE CAPTURE APPLICATIONS", red_fill)
    ws2.merge_cells("J5:P5"); hdr_cell(ws2, 5, 10, "MANUAL APPLICATIONS", amber_fill)
    ws2.merge_cells("Q5:Q7"); hdr_cell(ws2, 5, 17, "TOTAL\nREGISTERED", gray_fill)

    # Row 6: NPR / Replacement sub-groups (rowspan 2 for the Sub Total columns)
    ws2.merge_cells("C6:E6"); hdr_cell(ws2, 6, 3, "INITIAL (NPR)", gray_fill)
    ws2.merge_cells("F6:H6"); hdr_cell(ws2, 6, 6, "OTHERS (REPLACEMENT)", gray_fill)
    ws2.merge_cells("I6:I7"); hdr_cell(ws2, 6, 9, "SUB\nTOTAL", gray_fill)
    ws2.merge_cells("J6:L6"); hdr_cell(ws2, 6, 10, "INITIAL (NPR)", gray_fill)
    ws2.merge_cells("M6:O6"); hdr_cell(ws2, 6, 13, "OTHERS (REPLACEMENT)", gray_fill)
    ws2.merge_cells("P6:P7"); hdr_cell(ws2, 6, 16, "SUB\nTOTAL", gray_fill)

    # Row 7: leaf M/F/T headers
    for col in (3, 6, 10, 13):
        hdr_cell(ws2, 7, col, "M", gray_fill)
        hdr_cell(ws2, 7, col + 1, "F", gray_fill)
        hdr_cell(ws2, 7, col + 2, "T", gray_fill)

    ws2.column_dimensions["A"].width = 18
    ws2.column_dimensions["B"].width = 18
    for col_letter in ("C","D","E","F","G","H","I","J","K","L","M","N","O","P"):
        ws2.column_dimensions[col_letter].width = 7
    ws2.column_dimensions["Q"].width = 13
    for r in (5, 6, 7):
        ws2.row_dimensions[r].height = 24

    def data_row(ws, row_idx, vals, font):
        for ci, val in enumerate(vals, start=1):
            cell = ws.cell(row=row_idx, column=ci, value=val)
            cell.font = font
            cell.border = border
            cell.alignment = Alignment(horizontal="left" if ci <= 2 else "right", vertical="center")

    ri = 8
    for row in data["breakdown"]:
        data_row(ws2, ri, [
            row["county"], row["subcounty"],
            row["live_npr_male"], row["live_npr_female"], row["live_npr_total"],
            row["live_replacement_male"], row["live_replacement_female"], row["live_replacement_total"],
            row["live_total"],
            row["manual_npr_male"], row["manual_npr_female"], row["manual_npr_total"],
            row["manual_replacement_male"], row["manual_replacement_female"], row["manual_replacement_total"],
            row["manual_total"],
            row["total_registered"],
        ], data_font)
        ri += 1

    data_row(ws2, ri, [
        "GRAND TOTAL", "",
        t["live_npr_male"], t["live_npr_female"], t["live_npr_total"],
        t["live_replacement_male"], t["live_replacement_female"], t["live_replacement_total"],
        t["live_total"],
        t["manual_npr_male"], t["manual_npr_female"], t["manual_npr_total"],
        t["manual_replacement_male"], t["manual_replacement_female"], t["manual_replacement_total"],
        t["manual_total"],
        t["total_registered"],
    ], grand_font)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def build_mobile_pdf_report(data: dict, year: int, month: "int | None", quarter: "int | None",
                             org_name: str = "National Registration Bureau") -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm,
    )
    period = _mobile_period_text(year, month, quarter)
    c_gray = colors.HexColor(f"#{_MOBILE_GRAY}")
    c_red = colors.HexColor(f"#{_MOBILE_RED}")
    c_amber = colors.HexColor(f"#{_MOBILE_AMBER}")
    c_grid = colors.HexColor("#000000")

    title_style    = ParagraphStyle("t1", fontSize=16, fontName="Times-Bold", alignment=1, spaceAfter=2)
    subtitle_style = ParagraphStyle("t2", fontSize=13, fontName="Times-Bold", alignment=1, spaceAfter=2)
    period_style   = ParagraphStyle("t3", fontSize=13, fontName="Times-Bold", alignment=1, spaceAfter=6)
    h2_style       = ParagraphStyle("h2", fontSize=11, fontName="Times-Bold", spaceBefore=4, spaceAfter=4)

    story = [
        Paragraph("NATIONAL REGISTRATION BUREAU", title_style),
        Paragraph("USAJILI MASHINANI — MOBILE REGISTRATION REPORT", subtitle_style),
        Paragraph(period, period_style),
    ]

    # Table 1: Target vs Achievement
    story.append(Paragraph("Target vs. Achievement — by County", h2_style))
    t = data["totals"]
    tbl1 = [["County", "Target", "Registered", "Achievement %"]]
    style1 = [
        ("BACKGROUND", (0, 0), (-1, 0), c_gray), ("FONTNAME", (0, 0), (-1, 0), "Times-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Times-Roman"), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, c_grid),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for row in data["county_totals"]:
        tbl1.append([row["county"], f"{row['target_set']:,}", f"{row['total_registered']:,}", f"{row['target_achievement_pct']:.1f}%"])
    grand_row = len(tbl1)
    tbl1.append(["GRAND TOTAL", f"{t['target_set']:,}", f"{t['total_registered']:,}", f"{t['target_achievement_pct']:.1f}%"])
    style1 += [("FONTNAME", (0, grand_row), (-1, grand_row), "Times-Bold")]
    story.append(Table(tbl1, colWidths=[6 * cm, 4 * cm, 4 * cm, 4 * cm], style=TableStyle(style1)))
    story.append(Spacer(1, 0.6 * cm))

    # Table 2: Registration Volume by County & Subcounty — mirrors the field
    # template's own breakdown: Live Capture vs Manual, each split into NPR
    # (Initial) and Replacement ("Duplicate") applications, by M/F.
    story.append(Paragraph("Registration Volume — by County &amp; Subcounty", h2_style))
    header_row0 = ["County", "Subcounty", "LIVE CAPTURE APPLICATIONS", "", "", "", "", "", "",
                   "MANUAL APPLICATIONS", "", "", "", "", "", "", "TOTAL\nREGISTERED"]
    header_row1 = ["", "", "INITIAL (NPR)", "", "", "OTHERS (REPLACEMENT)", "", "", "SUB\nTOTAL",
                   "INITIAL (NPR)", "", "", "OTHERS (REPLACEMENT)", "", "", "SUB\nTOTAL", ""]
    header_row2 = ["", "", "M", "F", "T", "M", "F", "T", "", "M", "F", "T", "M", "F", "T", "", ""]
    tbl2 = [header_row0, header_row1, header_row2]
    style2 = [
        ("SPAN", (0, 0), (0, 2)), ("SPAN", (1, 0), (1, 2)), ("SPAN", (16, 0), (16, 2)),
        ("SPAN", (2, 0), (8, 0)), ("SPAN", (9, 0), (15, 0)),
        ("SPAN", (2, 1), (4, 1)), ("SPAN", (5, 1), (7, 1)), ("SPAN", (8, 1), (8, 2)),
        ("SPAN", (9, 1), (11, 1)), ("SPAN", (12, 1), (14, 1)), ("SPAN", (15, 1), (15, 2)),
        ("BACKGROUND", (0, 0), (1, 2), c_gray), ("BACKGROUND", (16, 0), (16, 2), c_gray),
        ("BACKGROUND", (2, 0), (8, 2), c_red), ("BACKGROUND", (9, 0), (15, 2), c_amber),
        ("FONTNAME", (0, 0), (-1, 2), "Times-Bold"),
        ("FONTNAME", (0, 3), (-1, -1), "Times-Roman"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("ALIGN", (0, 3), (1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, c_grid),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for row in data["breakdown"]:
        tbl2.append([
            row["county"], row["subcounty"],
            row["live_npr_male"], row["live_npr_female"], row["live_npr_total"],
            row["live_replacement_male"], row["live_replacement_female"], row["live_replacement_total"],
            row["live_total"],
            row["manual_npr_male"], row["manual_npr_female"], row["manual_npr_total"],
            row["manual_replacement_male"], row["manual_replacement_female"], row["manual_replacement_total"],
            row["manual_total"], row["total_registered"],
        ])
    grand_row2 = len(tbl2)
    tbl2.append([
        "GRAND TOTAL", "",
        t["live_npr_male"], t["live_npr_female"], t["live_npr_total"],
        t["live_replacement_male"], t["live_replacement_female"], t["live_replacement_total"],
        t["live_total"],
        t["manual_npr_male"], t["manual_npr_female"], t["manual_npr_total"],
        t["manual_replacement_male"], t["manual_replacement_female"], t["manual_replacement_total"],
        t["manual_total"], t["total_registered"],
    ])
    style2 += [
        ("FONTNAME", (0, grand_row2), (-1, grand_row2), "Times-Bold"),
        ("FONTSIZE", (0, 0), (-1, 2), 7),  # smaller font in the 3 header rows — labels are long
    ]
    col_w = [2.0 * cm, 2.0 * cm] + [1.0 * cm] * 3 + [1.0 * cm] * 3 + [1.7 * cm] \
        + [1.0 * cm] * 3 + [1.0 * cm] * 3 + [1.7 * cm] + [2.2 * cm]
    story.append(Table(tbl2, colWidths=col_w, style=TableStyle(style2)))

    from datetime import date
    footer = ParagraphStyle("footer", fontSize=8, fontName="Times-Italic", textColor=colors.grey, alignment=1, spaceBefore=10)
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(f"{org_name} · Generated {date.today().strftime('%d %B %Y')}", footer))

    doc.build(story)
    return buffer.getvalue()


def build_mobile_word_report(data: dict, year: int, month: "int | None", quarter: "int | None") -> bytes:
    doc = Document()
    section = doc.sections[0]
    section.orientation = 1
    section.page_width, section.page_height = section.page_height, section.page_width
    section.left_margin = section.right_margin = Inches(0.5)
    section.top_margin = section.bottom_margin = Inches(0.5)

    period = _mobile_period_text(year, month, quarter)

    def add_title(text: str, size: int):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(size)
        run.font.name = _MOBILE_FONT

    add_title("NATIONAL REGISTRATION BUREAU", 16)
    add_title("USAJILI MASHINANI — MOBILE REGISTRATION REPORT", 13)
    add_title(period, 13)
    doc.add_paragraph()

    t = data["totals"]

    doc.add_paragraph().add_run("Target vs. Achievement — by County").bold = True
    cols1 = ["County", "Target", "Registered", "Achievement %"]
    table1 = doc.add_table(rows=1 + len(data["county_totals"]) + 1, cols=4)
    table1.style = "Table Grid"
    for ci, lbl in enumerate(cols1):
        _cell_text(table1.rows[0].cells[ci], lbl, bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, font_name=_MOBILE_FONT)
        _set_cell_bg(table1.rows[0].cells[ci], _MOBILE_GRAY)
    for ri, row in enumerate(data["county_totals"], start=1):
        vals = [row["county"], f"{row['target_set']:,}", f"{row['total_registered']:,}", f"{row['target_achievement_pct']:.1f}%"]
        for ci, val in enumerate(vals):
            _cell_text(table1.rows[ri].cells[ci], val, size=9, align=WD_ALIGN_PARAGRAPH.LEFT if ci == 0 else WD_ALIGN_PARAGRAPH.RIGHT, font_name=_MOBILE_FONT)
    grand_idx = len(data["county_totals"]) + 1
    grand_vals = ["GRAND TOTAL", f"{t['target_set']:,}", f"{t['total_registered']:,}", f"{t['target_achievement_pct']:.1f}%"]
    for ci, val in enumerate(grand_vals):
        _cell_text(table1.rows[grand_idx].cells[ci], val, bold=True, size=9,
                   align=WD_ALIGN_PARAGRAPH.LEFT if ci == 0 else WD_ALIGN_PARAGRAPH.RIGHT, font_name=_MOBILE_FONT)

    doc.add_paragraph()
    doc.add_paragraph().add_run("Registration Volume — by County & Subcounty").bold = True
    # Mirrors the field template's own breakdown: Live Capture vs Manual, each
    # split into NPR (Initial) and Replacement ("Duplicate") applications, by M/F.
    n_data = len(data["breakdown"])
    table2 = doc.add_table(rows=3 + n_data + 1, cols=17)
    table2.style = "Table Grid"
    r0, r1, r2 = table2.rows[0], table2.rows[1], table2.rows[2]

    def merge_h(row, c1, c2):
        row.cells[c1].merge(row.cells[c2])

    def merge_v(c, r1_idx, r2_idx):
        table2.rows[r1_idx].cells[c].merge(table2.rows[r2_idx].cells[c])

    merge_v(0, 0, 2); merge_v(1, 0, 2); merge_v(16, 0, 2)
    merge_h(r0, 2, 8); merge_h(r0, 9, 15)
    merge_h(r1, 2, 4); merge_h(r1, 5, 7); merge_v(8, 1, 2)
    merge_h(r1, 9, 11); merge_h(r1, 12, 14); merge_v(15, 1, 2)

    for ci, lbl in [(0, "County"), (1, "Subcounty"), (2, "LIVE CAPTURE APPLICATIONS"),
                    (9, "MANUAL APPLICATIONS"), (16, "TOTAL REGISTERED")]:
        _cell_text(r0.cells[ci], lbl, bold=True, size=8, align=WD_ALIGN_PARAGRAPH.CENTER, font_name=_MOBILE_FONT)
    for ci, fill in [(0, _MOBILE_GRAY), (1, _MOBILE_GRAY), (2, _MOBILE_RED), (9, _MOBILE_AMBER), (16, _MOBILE_GRAY)]:
        _set_cell_bg(r0.cells[ci], fill)

    for ci, lbl in [(2, "INITIAL (NPR)"), (5, "OTHERS (REPLACEMENT)"), (8, "SUB TOTAL"),
                    (9, "INITIAL (NPR)"), (12, "OTHERS (REPLACEMENT)"), (15, "SUB TOTAL")]:
        _cell_text(r1.cells[ci], lbl, bold=True, size=8, align=WD_ALIGN_PARAGRAPH.CENTER, font_name=_MOBILE_FONT)
    for ci, fill in [(2, _MOBILE_RED), (5, _MOBILE_RED), (8, _MOBILE_RED), (9, _MOBILE_AMBER), (12, _MOBILE_AMBER), (15, _MOBILE_AMBER)]:
        _set_cell_bg(r1.cells[ci], fill)

    for ci in (2, 5, 9, 12):
        _cell_text(r2.cells[ci], "M", bold=True, size=8, align=WD_ALIGN_PARAGRAPH.CENTER, font_name=_MOBILE_FONT)
        _cell_text(r2.cells[ci + 1], "F", bold=True, size=8, align=WD_ALIGN_PARAGRAPH.CENTER, font_name=_MOBILE_FONT)
        _cell_text(r2.cells[ci + 2], "T", bold=True, size=8, align=WD_ALIGN_PARAGRAPH.CENTER, font_name=_MOBILE_FONT)
        fill = _MOBILE_RED if ci < 9 else _MOBILE_AMBER
        _set_cell_bg(r2.cells[ci], fill); _set_cell_bg(r2.cells[ci + 1], fill); _set_cell_bg(r2.cells[ci + 2], fill)

    for ri, row in enumerate(data["breakdown"], start=3):
        vals = [
            row["county"], row["subcounty"],
            row["live_npr_male"], row["live_npr_female"], row["live_npr_total"],
            row["live_replacement_male"], row["live_replacement_female"], row["live_replacement_total"],
            row["live_total"],
            row["manual_npr_male"], row["manual_npr_female"], row["manual_npr_total"],
            row["manual_replacement_male"], row["manual_replacement_female"], row["manual_replacement_total"],
            row["manual_total"], row["total_registered"],
        ]
        for ci, val in enumerate(vals):
            align = WD_ALIGN_PARAGRAPH.LEFT if ci <= 1 else WD_ALIGN_PARAGRAPH.RIGHT
            _cell_text(table2.rows[ri].cells[ci], f"{val:,}" if isinstance(val, int) else val, size=8, align=align, font_name=_MOBILE_FONT)

    grand_idx2 = 3 + n_data
    grand_vals2 = [
        "GRAND TOTAL", "",
        t["live_npr_male"], t["live_npr_female"], t["live_npr_total"],
        t["live_replacement_male"], t["live_replacement_female"], t["live_replacement_total"],
        t["live_total"],
        t["manual_npr_male"], t["manual_npr_female"], t["manual_npr_total"],
        t["manual_replacement_male"], t["manual_replacement_female"], t["manual_replacement_total"],
        t["manual_total"], t["total_registered"],
    ]
    for ci, val in enumerate(grand_vals2):
        align = WD_ALIGN_PARAGRAPH.LEFT if ci <= 1 else WD_ALIGN_PARAGRAPH.RIGHT
        text = f"{val:,}" if isinstance(val, int) else val
        _cell_text(table2.rows[grand_idx2].cells[ci], text, bold=True, size=8, align=align, font_name=_MOBILE_FONT)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
