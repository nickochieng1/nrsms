from app.models.mobile_registration import MobileRegistration, MobileRegistrationEntry


def compute_entry_totals(entry: MobileRegistrationEntry) -> None:
    entry.live_npr_total = entry.live_npr_male + entry.live_npr_female
    entry.live_replacement_total = entry.live_replacement_male + entry.live_replacement_female
    entry.live_subtotal = entry.live_npr_total + entry.live_replacement_total

    entry.manual_npr_total = entry.manual_npr_male + entry.manual_npr_female
    entry.manual_replacement_total = entry.manual_replacement_male + entry.manual_replacement_female
    entry.manual_subtotal = entry.manual_npr_total + entry.manual_replacement_total

    entry.daily_total = entry.live_subtotal + entry.manual_subtotal


def compute_age_band_totals(record: MobileRegistration) -> None:
    # Fields may still be None pre-flush if the caller omitted them (column
    # default=0 only materializes at INSERT time), so coalesce defensively.
    record.age_25_40_male = record.age_25_40_male or 0
    record.age_25_40_female = record.age_25_40_female or 0
    record.age_41_60_male = record.age_41_60_male or 0
    record.age_41_60_female = record.age_41_60_female or 0
    record.age_60_plus_male = record.age_60_plus_male or 0
    record.age_60_plus_female = record.age_60_plus_female or 0

    record.age_25_40_total = record.age_25_40_male + record.age_25_40_female
    record.age_41_60_total = record.age_41_60_male + record.age_41_60_female
    record.age_60_plus_total = record.age_60_plus_male + record.age_60_plus_female
