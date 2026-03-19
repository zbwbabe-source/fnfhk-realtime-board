# FNF HKMC/TW Dashboard Guide

This guide explains the dashboard in a single document based on the current codebase.

It focuses on what each screen means, how the main numbers are calculated, where the data comes from, and how to read the results for day-to-day business use.

## 1. What this dashboard is for

This dashboard is built to manage three things together:

1. Whether actual sales are tracking to target
2. Whether in-season products are selling through well
3. Whether old-season inventory is being cleared at the right pace

So this is not just a sales screen.

It is an operating dashboard that combines:

- current season performance
- target progress
- old inventory cleanup status

## 2. Main controls at the top

Users usually change the following:

### 2.1 Region

- `HKMC`
- `TW`

Meaning:

- `HKMC` = Hong Kong / Macau
- `TW` = Taiwan

### 2.2 Brand

- `MLB`
- `DISCOVERY`

The backend uses brand codes, but the screen shows brand names.

### 2.3 Date

All metrics are recalculated based on the selected date.

Example:

- if the user selects `2026-03-18`
- the dashboard calculates most values as of `2026-03-18`

### 2.4 Language

- `KR`
- `EN`

Only the display language changes. The business logic does not change.

## 3. Where the data comes from

The dashboard combines several data sources.

### 3.1 Core source data

1. Snowflake sales data
2. Snowflake stock data
3. Excel / CSV based target data
4. Exchange-rate data

### 3.2 Representative file-based sources

- `data/target.json`
  - Section1 target data
- `data/store_master.json`
  - store master
- `data/store_area.json`
  - store area
- `data/tw_exchange_rate.json`
  - Taiwan exchange rate
- `data/section3_target_source/section3_targets.json`
  - Section3 target data

### 3.3 Tag-price basis

Many values in this dashboard are shown on a `TAG` basis.

In practical terms, that means:

- the comparison is done using regular-price value
- this is separate from actual discounted sales value

So when the screen says `Tag Basis`, it means:

- target and actual are being compared on regular-price value

## 4. Overall data flow

The dashboard works roughly like this:

1. The user selects region, brand, and date
2. Each section API is called
3. Redis cache is checked first
4. If the cache is missing, the system recalculates from Snowflake and local files
5. The results are rendered into cards and charts

So the dashboard is not just a static display.

It connects:

- data retrieval
- business calculation
- caching
- visualization

## 5. Section 1: Actual Sales

### 5.1 What it shows

Section1 is the sales performance area.

Its main questions are:

- How much have we sold so far this month?
- Are we ahead of or behind last year?
- How far are we against target?
- Where are we likely to land by month-end?

### 5.2 Main KPI meanings

#### Actual Sales

This is actual sales amount.

Depending on the mode, the screen can show:

- `MTD`
- `YTD`

#### YoY

This shows performance versus the same period last year.

Example:

- `108%` means 8% above last year
- `92%` means 8% below last year

#### Progress

This shows how much of the target has been achieved.

Formula:

`Progress = Actual / Target × 100`

#### Month-end projection

This estimates where the month will finish if the current trend continues.

Section1 does not use only simple daily run-rate.

It also reflects historical same-month patterns, weekdays, and seasonal effects.

### 5.3 Additional views in Section1

1. sales by store
2. sales per area
3. top and bottom stores
4. season and category cards

So Section1 is not only about total sales.

It also helps answer:

- which stores are driving results
- which seasons or categories are helping or hurting

### 5.4 Key calculations in Section1

#### MTD actual

Actual sales from the first day of the selected month to the selected date

#### YTD actual

Actual sales from the start of the year to the selected date

#### Discount rate

This measures how much lower actual sales are compared with tag value.

Formula:

`Discount Rate = 1 - Actual Sales / Tag Sales`

#### Discount-rate change vs last year

This is the difference between this year’s discount rate and last year’s discount rate.

It is shown in `%p`.

Example:

- `+2.3%p` means markdown intensity is stronger than last year
- `-1.5%p` means markdown intensity is lighter than last year

## 6. Section 2: In-season Sell-through

### 6.1 What it shows

Section2 shows how well current-season products are selling through.

Its main questions are:

- How much of the inbound value has sold?
- Which categories are strong or weak?
- Is current stock still healthy?

### 6.2 Sell-through meaning

Sell-through is not just sales amount.

It measures:

“How much of what came in has already sold?”

Formula:

`Sell-through = Sales / Inbound × 100`

For this dashboard, inbound is handled as:

`Inbound = Sales + Current Stock`

So the dashboard estimates original inbound using:

- what has already sold
- what is still left

### 6.3 Main KPI meanings

#### Sell-through

Overall in-season sell-through

#### Cumulative Sales (TAG)

Cumulative sales value on a regular-price basis

#### Cumulative Inbound (TAG)

Cumulative inbound value on a regular-price basis

### 6.4 Sales by Category

This area shows, by category:

- sales share
- YoY
- discount rate

using a treemap.

In simple terms:

- bigger box = bigger share
- text and colors help show performance and markdown status together

## 7. Section 3: Old-season Clearance

### 7.1 What it shows

Section3 measures how well older inventory is being cleared.

Its main questions are:

- How much old inventory is still left?
- How much has been cleared in the current period?
- Are we moving fast enough versus target?
- Is stagnant inventory becoming risky?

### 7.2 What “old-season” means

Old-season means stock from previous seasons that is still unsold.

Example:

- if the current timing is `26SS`
- old-season includes `25SS`, `24SS`, and `23SS or older`

In other words, it compares against older seasons of the same season type.

### 7.3 SS / FW logic

Section3 automatically switches by date.

#### SS period

- roughly from March 1 to the end of August
- compares old `SS` inventory

#### FW period

- roughly from September 1 to the end of February
- compares old `FW` inventory

So:

- during SS, the dashboard looks at SS old-season stock
- during FW, the dashboard looks at FW old-season stock

### 7.4 Main cards in Section3

#### Current Stock (TAG)

Current remaining old-season stock value

Usually viewed together with:

- YoY
- stagnant ratio

#### Depleted Stock

Old-season value cleared during the selected period

The large number currently represents cumulative cleared value.

Related details usually include:

- clearance period
- current month cleared value
- monthly target
- YoY
- discount rate
- discount-rate change vs last year

#### Progress vs Target

This shows how much of the clearance target has been achieved.

Related details include:

- projected month-end progress
- discount rate
- discount-rate gap versus target

### 7.5 Key calculations in Section3

#### Stagnant ratio

The share of stagnant inventory within current old-season stock

Formula:

`Stagnant Ratio = Stagnant Stock / Current Stock × 100`

#### Clearance actual

The old-season amount cleared during the current period

The dashboard mainly uses TAG-based value for this comparison.

#### Clearance YoY

How this year’s cleared amount compares to the same basis last year

#### Target progress

Formula:

`Progress = Actual Cleared Amount / Target Cleared Amount × 100`

#### Month-end projection

Section3 currently uses simple daily run-rate projection.

Formula:

`Projected Month-end Actual = MTD Actual / Elapsed Days × Days in Month`

`Projected Progress = Projected Month-end Actual / Monthly Target × 100`

So this answers:

- if the current daily pace continues
- where month-end progress is likely to land

#### Discount rate

Formula:

`Discount Rate = 1 - Actual Sales / Tag Sales`

Section3 manages:

- actual discount rate
- change versus last year
- gap versus target discount rate

### 7.6 Section3 target data

At the moment, Section3 target data exists only for `HKMC`.

So:

- `HKMC`: target comparison available
- `TW`: no Section3 target data yet

### 7.7 Important target rules in Section3

The current target source follows these rules:

1. `NS` is excluded
2. apparel = `WEAR`
3. accessory = `SEASONAL ACCESSORY`
4. total = apparel + accessory

### 7.8 Section3 heatmap

The detail page includes an `Old-season Target Heatmap`.

Its purpose is to show, at a glance:

- age bucket
- category
- progress versus target

The current concept is:

- one axis: `Wear / Accessory / Total`
- the other axis: `Y1 / Y2 / Y3`

Inside each cell, the key values are:

- current progress
- projected month-end progress

On hover, users can see:

- depleted amount
- target amount
- progress
- projected month-end
- discount rate
- discount gap versus target

## 8. Differences between HKMC and TW

### 8.1 Common points

- same dashboard structure
- mostly the same calculation logic
- same date, brand, and section layout

### 8.2 Key differences

#### Target data

- HKMC has Section3 target support
- TW does not yet have Section3 target support

#### Exchange rate

TW values are converted for consistent comparison in HKD-based views.

That means TW numbers go through exchange-rate logic internally.

## 9. Why the detail page is simpler at the top

The top cards on the detail page were simplified on purpose.

Reason:

- show only the most important KPIs first
- leave the detail to charts and tables below

So the top area is intentionally concise.

### Section1 top KPIs

- Actual Sales
- YoY
- Progress

### Section2 top KPIs

- Sell-through
- Cumulative Sales (TAG)
- Cumulative Inbound (TAG)

### Section3 top KPIs

- Current Stock (TAG)
- Depleted Stock
- Progress vs Target

## 10. What Data Management is for

`Data Management` is the screen that shows which files feed the dashboard.

It helps users check:

- which CSV / JSON files are in use
- when they were last updated
- which dashboard logic uses them

It also includes Section3 target outputs, such as:

- `data/section3_target_source/monthly_detail.csv`
- `data/section3_target_source/monthly_targets.csv`
- `data/section3_target_source/section3_targets.csv`
- `data/section3_target_source/section3_targets.json`

## 11. Why cache and prebuilt updates matter

The dashboard handles large data and complex calculations.

If everything were recalculated from scratch every time, the screen could become slow.

To avoid that, the system uses:

1. Redis cache
2. Cron-based prebuilt snapshots

In simple terms:

- frequently used date combinations are prepared in advance
- users get faster responses

## 12. Important ways to read the numbers

### 12.1 YoY uses 100 as the baseline

- `100%` = same as last year
- `110%` = 10% above last year
- `90%` = 10% below last year

### 12.2 `%` and `%p` are different

Example:

- discount rate `30%`
- discount-rate change `+2.0%p`

`%p` means percentage points.

If last year was 28% and this year is 30%, then:

- the increase is `+2.0%p`

### 12.3 TAG basis and actual basis are not the same

Even if both are called “sales,” the meaning changes depending on whether the number is based on:

- regular-price value
- actual selling value

That is why `Tag Basis` is an important label on the screen.

## 13. Key operating takeaways

1. Section1 is for sales performance and target progress
2. Section2 is for current-season product health
3. Section3 is for old-season inventory clearance
4. HKMC supports Section3 target comparison, TW does not yet
5. Section3 month-end projection is currently simple daily run-rate
6. Discount rate matters as much as sales amount

## 14. How this guide relates to the code

This guide is a business explanation document.

The final source of truth is still the code.

The most important files for actual logic are:

- `lib/section1/store-sales.ts`
- `lib/section2/sellthrough.ts`
- `lib/section2/treemap.ts`
- `lib/section3Query.ts`
- `app/dashboard/components/Section1Card.tsx`
- `app/dashboard/components/Section2Card.tsx`
- `app/dashboard/components/Section3Card.tsx`

But for operations, reporting, and handover, this guide is meant to provide one place to understand:

- what the dashboard is trying to show
- what the numbers mean
- which differences matter most
