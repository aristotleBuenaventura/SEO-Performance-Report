# SEO Performance Report — Excel Formula Spec

Source: `SEO Performance Report - June 2026.xlsx`  
Companion machine-readable extract: [`excel-formulas.json`](./excel-formulas.json)

This document is the R&D reference for rebuilding the spreadsheet as a website/system.

---

## Bottom line

There are almost **no complex Excel formulas**. The workbook is mostly **manual inputs**, with two formula types:

1. **FX conversion** — `GGR_USD = GGR_local / FX_rate`
2. **SUM totals** — Grand Total row + monthly GGR (USD) subtotals

Sheets **do not reference each other** via Excel formulas (`Sheet!A1` links = 0). Cross-brand/channel reporting must be built in the application.

---

## Workbook inventory (17 sheets)

| Sheet | Role | ~Rows | Schema |
|---|---|---|---|
| Ads | Paid ads performance | 368 | A |
| Blackhat Push Ads | Push/pop ads | 62 | A |
| Phishing Campaign | Phishing/SEO campaigns | 30 | A+ |
| MCW | Brand MCW (largest) | 2570 | B |
| B1 | Brand | 327 | B |
| B2 | Brand | 281 | B |
| K1 | Brand | 251 | B |
| B3 | Brand | 161 | B |
| B4 | Brand | 210 | B |
| G1 | Brand | 132 | B |
| TK | Brand | 29 | B |
| BP | Brand | 29 | B |
| JW | Brand | 29 | B |
| NCVIP | Brand | 281 | B |
| M3 | Brand | 219 | B |
| C1 | Brand | 87 | B |
| BPM | Brand | 111 | B |

### Logical grouping

```text
Channels (paid/special)          Brands (SEO performance)
├─ Ads                           ├─ MCW (main)
├─ Blackhat Push Ads             ├─ B1–B4, K1, G1
└─ Phishing Campaign             ├─ TK, BP, JW
                                 └─ NCVIP, M3, C1, BPM
```

**Named ranges:** only auto-filter databases on `B3` and `MCW`.  
**Cross-sheet formula refs:** none.

---

## Column schemas

### Schema A — Ads / Blackhat Push Ads

| Col | Field | Role | Formula |
|---|---|---|---|
| A | Month | input (Excel serial) | — |
| B | CCY | input | — |
| C | Name | input (agency/vendor) | — |
| D | Start Date | input | — |
| E | End Date | input | — |
| F | Ad Format | input | — |
| G | Cost | input | Footer: `SUM(G2:Gn)` |
| H | BO SU | input | Footer: `SUM(H…)` |
| I | BO FTD | input | Footer: `SUM(I…)` |
| J | Deposits | input | — |
| K | WD | input | — |
| L | Turnover | input | — |
| M | Bonus | input | — |
| N | GGR | input (local currency) | — |
| O | **GGR (USD)** | **calculated** | `=N{row}/{fx_rate}` |

### Schema A+ — Phishing Campaign

Same idea as A, plus **Website**, **Impressions**, **Clicks**.  
GGR = **Q**, GGR USD = **R** → `=Q{row}/{fx_rate}`

| Col | Field | Role | Formula |
|---|---|---|---|
| A | Month | input | — |
| B | CCY | input | — |
| C | Website | input | — |
| D | Name | input | — |
| E | Start Date | input | — |
| F | End Date | input | — |
| G | Ad Format | input | — |
| H | Cost | input | Footer: `SUM` |
| I | Impressions | input | — |
| J | Clicks | input | — |
| K | BO SU | input | — |
| L | BO FTD | input | — |
| M | Deposits | input | — |
| N | WD | input | — |
| O | Turnover | input | — |
| P | Bonus | input | — |
| Q | GGR | input | — |
| R | **GGR (USD)** | **calculated** | `=Q{row}/{fx_rate}` |

### Schema B — Brand sheets (MCW, B1, …)

| Col | Field | Role | Formula |
|---|---|---|---|
| A | Month | input | — |
| B | CCY | input (sometimes compound e.g. `BDT MCW`) | — |
| C | Website | input | — |
| D | Name | input (team/agency) | — |
| E | Campaign Type | input (`External` / `Internal` / vendor) | — |
| F | Start Date | input | — |
| G | End Date | input | — |
| H | Ad Format | input (usually `SEO`) | — |
| I | Cost | input | Grand Total `SUM` |
| J | Impressions | input | Grand Total `SUM` (some sheets) |
| K | Clicks | input | Grand Total `SUM` |
| L | BO SU | input | Grand Total `SUM` |
| M | BO FTD | input | Grand Total `SUM` |
| N | Deposits | input | — |
| O | WD | input | — |
| P | Turnover | input | — |
| Q | Bonus | input | — |
| R | GGR | input (local) | — |
| S | **GGR (USD)** | **calculated** | `=R{row}/{fx_rate}` |

---

## Complete formula catalog

Workbook-wide, formulas collapse to these skeletons:

| Approx count | Pattern | Meaning |
|---|---|---|
| ~3,362 | `R{row}/{fx}` | Brand: GGR USD = GGR ÷ FX |
| ~316 | `N{row}/{fx}` | Ads/Blackhat: GGR USD = GGR ÷ FX |
| ~13 | `Q{row}/{fx}` | Phishing: GGR USD = GGR ÷ FX |
| ~238 | `SUM(S{a}:S{b})` | Monthly GGR USD subtotals |
| ~108 | `SUM(I{a}:I{b})` | Cost / grand-total sums |
| few | `SUM(J…M…)` etc. | Metric grand totals |
| rare | `R{row}` | Identity / incomplete (bugs) |
| rare | `R{row}/{a}/{b}` | Broken double-divide (bugs) |

That is the **entire** formula language of this workbook.

Per-sheet, per-column detail (examples, rate lists, monthly SUM ranges) lives in [`excel-formulas.json`](./excel-formulas.json).

---

## Core business formulas

### 1. Primary calculation — GGR (USD)

```text
GGR_USD = GGR_local / FX_rate
```

Excel examples:

```excel
=N2/110.87      ' Ads, BDT → GGR USD in O
=N6/56.43       ' Ads, PHP → GGR USD in O
=N10/24573      ' Ads, VND → GGR USD in O
=R3/109.69      ' MCW, BDT → GGR USD in S
=R4/56.58       ' MCW, PHP → GGR USD in S
=Q2/117.56      ' Phishing, BDT → GGR USD in R
```

**Critical for the website:** the FX rate is **hardcoded per cell** in Excel (not `VLOOKUP` / named table). Model it as:

```text
fx_rate = rate_table[currency][month]
ggr_usd = ggr_local / fx_rate
```

### 2. Grand Total row

```excel
A{last} = "Grand Total"
I{last} = SUM(I2:I{last-1})   ' Cost (and often other metrics)
S{last} = SUM(S2:S{last-1})   ' Total GGR USD (brand sheets)
```

Ads example:

```excel
G364 = SUM(G2:G363)
H364 = SUM(H2:H363)
I364 = SUM(I2:I363)
```

### 3. Monthly GGR USD subtotals (brand sheets)

Below Grand Total:

| Col R | Col S |
|---|---|
| Month serial (e.g. `46174` = 2026-06-01) | `=SUM(S{start}:S{end})` for that month’s row block |

B1 example:

```excel
R304 = 45474 (2024-07)   S304 = SUM(S2:S5)
R305 = 45505 (2024-08)   S305 = SUM(S6:S10)
...
R327 = 46174 (2026-06)   S327 = SUM(S280:S302)
```

Month serials in this file run **2024-07 → 2026-06**.

---

## Typical FX bands (from this file)

| CCY | Approx rate range vs USD |
|---|---|
| BDT | ~109–123 |
| PHP | ~55–62 |
| VND | ~24,000–26,400 |
| PKR | ~277–285 |
| MYR | ~3.9–4.8 |
| MXN | ~17.5 (also some odd `3.2`) |
| INR | ~92–95 |
| NPR | ~133–144 |
| LKR | ~292–308 |
| KRW | ~1,140–1,505 |
| KHR | ~24,500–26,200 |

Full rate frequency tables per currency (and per sheet) are in `excel-formulas.json` → `fx_rates_by_currency` / `sheets[].fx_rates_by_ccy`.

Dirty values exist (e.g. BDT rows with `24573` / `26314` — VND rates pasted wrong). Validate on import.

---

## Column & sheet relationships (logical model)

```text
┌─────────────────────────────────────────────────────────────┐
│  INPUT (per performance row)                                │
│  month, ccy, website?, name, campaign_type?,                │
│  start/end, ad_format, cost, impressions?, clicks?,         │
│  bo_su, bo_ftd, deposits, wd, turnover, bonus, ggr          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  LOOKUP: fx_rate = rate_table[ccy][month]                   │
│  CALC:   ggr_usd = ggr / fx_rate                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AGGREGATIONS                                               │
│  • Grand total per sheet (SUM metrics)                      │
│  • Monthly GGR USD per sheet                                │
│  • (Website) cross-brand rollups by month/ccy/format        │
└─────────────────────────────────────────────────────────────┘
```

### App-level dimensions (not Excel formula links)

| Dimension | Comes from |
|---|---|
| Brand / product | Sheet name (`MCW`, `B1`, `NCVIP`…) |
| Channel | Sheet family (`Ads` vs brand SEO) |
| Market | `CCY` (+ sometimes compound like `PHP MCW`) |
| Site | `Website` (Schema B / Phishing) |
| Vendor/team | `Name` |
| Campaign class | `Campaign Type` |
| Creative/channel type | `Ad Format` (`SEO`, `Facebook Ads`, `GDN`, `SEM`, `Push/Pop Ads`) |

There is **no** formula that pulls Ads into MCW or vice versa.

---

## Suggested data model

```text
brands              (code: MCW, B1, …)
channels            (ads, blackhat_push, phishing, brand_seo)
currencies          (BDT, PHP, VND, …)
fx_rates            (currency_code, month, rate)
partners            (Name / agency)
websites            (domain)
performance_rows    (all Schema A/B fields + brand_id + channel)
  - ggr_usd computed or stored from fx_rates
monthly_rollups     (optional cache: brand, month, sum ggr_usd, …)
```

### Compute in app (don’t copy Excel bugs)

```text
ggr_usd     = ggr / fx_rate(ccy, month)
roi         = ggr_usd / cost          ' not in Excel; optional KPI
cpa_ftd     = cost / bo_ftd           ' not in Excel; optional KPI
monthly_ggr = SUM(ggr_usd) GROUP BY month, brand
```

---

## Known Excel debt / import rules

1. **FX is manual** — rates differ by month; make FX a first-class table.
2. **Month/Date are Excel serials** — store as real dates (`2026-06-01`).
3. **`n/a` mixed with numbers** — treat as null in DB.
4. **Carry-forward Month** — Month often filled only on first row of a block; inherit downward when blank.
5. **Compound CCY** on NCVIP (`BDT MCW`, `PHP BPM`) — parse into `currency` + optional `brand_tag`.
6. **No derived GGR** — GGR is entered, not computed from deposits/WD/bonus.
7. **Footer SUMs are presentation** — regenerate from query; don’t import as data rows.
8. **Bugs in source file:**
   - **B1** Grand Total copies `SUM(I2:I302)` into J–S (every total shows Cost).
   - Wrong FX rates on some rows.
   - Rare `R{row}/{a}/{b}`, incomplete `R{row}/`, or identity `R{row}` formulas.

---

## Build checklist (website parity)

1. CRUD for performance rows (Schema B first — brand SEO).
2. FX rate table by currency + month.
3. Auto-calc `ggr_usd`.
4. Filters: brand, month, CCY, website, campaign type, ad format.
5. Views: data table + monthly GGR USD chart + grand totals.
6. Later: Ads / Blackhat / Phishing as channel modules (Schema A / A+).

---

## JSON extract map

[`excel-formulas.json`](./excel-formulas.json) contains:

| Key | Contents |
|---|---|
| `schemas` | Column definitions for A / A+ / B |
| `core_formulas` | Business formula definitions |
| `sheets[]` | Per-sheet headers, formula patterns, FX by CCY, grand totals, monthly subtotals |
| `fx_rates_by_currency` | Global rate ranges + frequencies |
| `known_issues` | Import/validation pitfalls |
| `summary.unique_formula_skeletons` | Workbook-wide skeleton counts |
