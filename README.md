# SEO Performance Report

Dark-mode React dashboard for per-brand **Impressions**, **Clicks**, and **GGR USD**, with login / 2FA / admin upload (same auth pattern as Bulk301).

## Slugs

| Path | Purpose |
|------|---------|
| `/` | Public SEO performance dashboard (no login) |
| `/login` | Admin sign-in, forgot password, reset, 2FA |
| `/admin` | Superadmin only: create accounts + upload Excel |

Login is only for admin tools. The report itself is public; uploaded Excel data is served publicly once published.

## Run (local)

```bash
npm install
cd worker && npm install && cp .dev.vars.example .dev.vars
# edit worker/.dev.vars — set ADMIN_SECRET (and SMTP_PASS for forgot-password)

# terminal 1
npm run dev:worker

# terminal 2
npm run dev
```

Open http://localhost:5173/ for the public report, or `/login` for admin.

### First superadmin (bootstrap)

```bash
curl -X POST http://127.0.0.1:8787/api/auth/upsert-user \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"YourLongPass123","adminSecret":"CHANGE_ME"}'
```

Then sign in → set up 2FA → use `/admin` to create operators and upload the Excel file.

## Excel upload

Admin uploads the full workbook (`.xlsx`). Sheets map to brands (MCW, B1, Ads, …). Parsed extract is stored in Worker KV and becomes the live report data. Until an upload exists, the bundled `src/data/excelExtract.json` is used as fallback.

## Docs

- `docs/excel-formula-spec.md`
- `docs/excel-formulas.json`
