# Section3 Target Source

This folder contains a prepared target dataset derived from `HKMC Old Season Target.xlsx` for Section3 usage.

## Primary files

- `section3_targets.csv`
- `section3_targets.json`
- `old_season_target.sqlite`
- `manifest.json`

## Target dimensions

- `month_code`
  - `JAN -> 2601`
  - `FEB -> 2602`
  - ...
  - `DEC -> 2612`
- `category_key`
  - `wear`: `WEAR`, Korean label `의류`
  - `accessory`: `ACCESSORY`, Korean label `악세`
  - `all`: `TOTAL`, Korean label `전체`
- `target_mode`
  - `monthly`: target for the selected month only
  - `cumulative`: cumulative target from the Section3 season start through the selected month

## Cumulative basis

- `SS`: cumulative from March (`3/1~`)
- `FW`: cumulative from September (`9/23~` season basis)
- Note: this workbook is a 2026 plan source. For `FW` months in January and February, a fully aligned season cumulative target would also need the prior-year September to December target source.

## Core metrics

- `target_sold_amt`: target net sales amount
- `target_sold_gross`: target gross sales amount
- `target_discount_rate`: calculated as `1 - (target_sold_amt / target_sold_gross)`

## Section3 scope rule

- `wear`: only `SEASONAL` + `WEAR`
- `accessory`: only `SEASONAL` + `ACCESSORY`
- `all`: `wear + accessory`
- `NS` must be excluded from all Section3 target calculations

## Notes

- `target_discount_rate` should be calculated from monthly or cumulative `sold_amt` and `sold_gross`.
- Do not use the workbook `disc_off` column as the monthly target discount rate. It behaves like a summary-level figure, not a month-level rate.
- This source is currently organized around the uploaded HKMC workbook and does not yet add extra region or brand dimensions.
