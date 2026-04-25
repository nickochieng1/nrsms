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
               align=WD_ALIGN_PARAGRAPH.LEFT):
    cell.text = ""
    para = cell.paragraphs[0]
    para.alignment = align
    run = para.add_run(str(text))
    run.bold = bold
    run.font.size = Pt(size)
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
