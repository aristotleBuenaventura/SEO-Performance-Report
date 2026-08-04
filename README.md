# SEO Performance Report

Dark-mode React dashboard for per-brand **Impressions**, **Clicks**, and **GGR USD**.

## Run

```bash
npm install
npm run dev
```

## Data source

From `SEO Performance Report - June 2026.xlsx` → `src/data/excelExtract.json`

| Tab | Excel source |
|---|---|
| MCW | `MCW` (excluding MXW CCY rows) |
| MXW | `MCW` rows where CCY contains `MXW` |
| Banglabet | `B1` |
| Bengalbet | `B2` |
| Khelaghor | `K1` |
| Banglaslots | `B3` |
| Banglawin | `B4` |
| GA888 | `G1` |
| TK Baazi | `TK` |
| Banglaplus | `BP` |
| Joywin | `JW` |
| NCVIP | `NCVIP` |
| MNLBet | `M3` |
| CF789 | `C1` |
| BPM | `BPM` |
| Ads | `Ads` |
| Blackhat Push | `Blackhat Push Ads` |
| Phishing | `Phishing Campaign` |

## Docs

- `docs/excel-formula-spec.md`
- `docs/excel-formulas.json`
