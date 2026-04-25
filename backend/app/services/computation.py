from app.models.submission import Submission

NRB_CATS = ("npr", "replacements", "changes", "duplicates", "type4", "type5")


def _compute_module(sub: Submission, prefix: str) -> None:
    """Compute category totals and grand totals for a male/female module."""
    grand_m = grand_f = 0
    for cat in NRB_CATS:
        m = getattr(sub, f"{prefix}_{cat}_male")
        f = getattr(sub, f"{prefix}_{cat}_female")
        setattr(sub, f"{prefix}_{cat}_total", m + f)
        grand_m += m
        grand_f += f
    setattr(sub, f"{prefix}_grand_male", grand_m)
    setattr(sub, f"{prefix}_grand_female", grand_f)
    setattr(sub, f"{prefix}_grand_total", grand_m + grand_f)


def _compute_register(sub: Submission, prefix: str) -> None:
    """Compute Balance C/F = B/D - Used - Spoilt + Returned."""
    bd = getattr(sub, f"{prefix}_balance_bd")
    used = getattr(sub, f"{prefix}_used")
    spoilt = getattr(sub, f"{prefix}_spoilt")
    returned = getattr(sub, f"{prefix}_returned")
    setattr(sub, f"{prefix}_balance_cf", max(0, bd - used - spoilt + returned))


def compute_submission_totals(submission: Submission) -> None:
    # Modules 1–3: NRB category breakdowns
    _compute_module(submission, "app")   # Applications to HQ
    _compute_module(submission, "ids")   # IDs received from HQ
    _compute_module(submission, "rej")   # Rejections from HQ

    # Module 4: Collected sub-categories
    COL_CATS = ("npr", "others", "rejected")
    col_m = col_f = 0
    for cat in COL_CATS:
        m = getattr(submission, f"collected_{cat}_male")
        f = getattr(submission, f"collected_{cat}_female")
        setattr(submission, f"collected_{cat}_total", m + f)
        col_m += m
        col_f += f
    submission.collected_male = col_m
    submission.collected_female = col_f
    submission.collected_total = col_m + col_f

    # Module 4: Uncollected sub-categories
    UNCOL_CATS = ("npr", "others", "lost")
    uncol_m = uncol_f = 0
    for cat in UNCOL_CATS:
        m = getattr(submission, f"uncollected_{cat}_male")
        f = getattr(submission, f"uncollected_{cat}_female")
        setattr(submission, f"uncollected_{cat}_total", m + f)
        uncol_m += m
        uncol_f += f
    submission.uncollected_male = uncol_m
    submission.uncollected_female = uncol_f
    submission.uncollected_total = uncol_m + uncol_f

    # Modules 5 & 6: Registers
    _compute_register(submission, "reg136c")
    _compute_register(submission, "photo3a")
