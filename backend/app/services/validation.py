from typing import List, Union

from app.schemas.submission import SubmissionCreate, SubmissionUpdate


VALIDATION_RULES = [
    {
        "check": lambda d: (d.app_npr_male + d.app_npr_female) <= 5_000,
        "message": "NPR applications exceed 5,000 for a single station/month.",
    },
    {
        "check": lambda d: (d.app_replacements_male + d.app_replacements_female) <= 3_000,
        "message": "Replacement applications exceed 3,000 for a single station/month.",
    },
    {
        "check": lambda d: d.rej_grand_total <= d.ids_grand_total if hasattr(d, "rej_grand_total") and hasattr(d, "ids_grand_total") else True,
        "message": "Rejections cannot exceed IDs received.",
    },
]


def validate_submission(data: Union[SubmissionCreate, SubmissionUpdate]) -> List[str]:
    warnings: List[str] = []
    for rule in VALIDATION_RULES:
        try:
            if not rule["check"](data):
                warnings.append(rule["message"])
        except (AttributeError, TypeError, ZeroDivisionError):
            pass
    return warnings
