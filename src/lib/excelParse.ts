import * as XLSX from 'xlsx'
import type { MonthlyMetric } from '../types'
import {
  brandFromSheetName,
  isAllowedBrandSheet,
  sortBrandIds,
} from '../data/brands'

export interface ExcelExtract {
  source: string
  extractedAt: string
  rules: {
    monthColumn: string
    currencyColumn: string
  }
  months: string[]
  currencies: string[]
  mapping: Record<string, string>
  brands: Record<
    string,
    { label: string; currencies: string[]; primaryCurrency: string }
  >
  tabOrder: string[]
  data: Record<string, Record<string, MonthlyMetric[]>>
}

type SchemaKind = 'brand' | 'ads' | 'phishing'

function isBrandSheet(sheetName: string): boolean {
  return isAllowedBrandSheet(sheetName)
}

/** Brand identity comes from the Excel sheet code → canonical registry. */
function resolveBrand(sheetName: string): { id: string; label: string } | null {
  const def = brandFromSheetName(sheetName)
  if (!def) return null
  return { id: def.id, label: def.label }
}

function schemaForSheet(name: string): SchemaKind {
  const n = name.trim().toLowerCase()
  if (n === 'ads' || n.includes('blackhat')) return 'ads'
  if (n.includes('phishing')) return 'phishing'
  return 'brand'
}

function parseMonth(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // sheet_to_json(cellDates) yields local-midnight Dates; UTC getters
    // shift PH/UTC+ timezones back one calendar day (May 1 → Apr 30).
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`
    }
  }
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return `${year}-${slash[1].padStart(2, '0')}`
  }
  // "Oct 2022", "October 2022"
  const named = text.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (named) {
    const months = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    ]
    const idx = months.findIndex((m) => named[1].toLowerCase().startsWith(m))
    if (idx >= 0) return `${named[2]}-${String(idx + 1).padStart(2, '0')}`
  }
  return null
}

function baseCurrency(value: unknown): string | null {
  if (value == null || value === '') return null
  const text = String(value).trim().toUpperCase()
  if (!text || text === 'TOTAL' || text.startsWith('GRAND')) return null
  const code = text.split(/\s+/)[0]
  if (!/^[A-Z]{3}$/.test(code)) return null
  return code
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) return 0
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function isFooterLabel(value: unknown): boolean {
  if (value == null) return false
  const t = String(value).trim().toLowerCase()
  return (
    t.includes('total') ||
    t.includes('grand') ||
    t.startsWith('sum') ||
    t === ''
  )
}

function colIndexes(kind: SchemaKind): {
  impressions: number
  clicks: number
  ggrUsd: number
} {
  if (kind === 'ads') {
    // Ads / Blackhat have no impressions/clicks columns in Schema A
    return { impressions: -1, clicks: -1, ggrUsd: 14 } // O
  }
  if (kind === 'phishing') {
    return { impressions: 8, clicks: 9, ggrUsd: 17 } // I J R
  }
  return { impressions: 9, clicks: 10, ggrUsd: 18 } // J K S
}

function aggregateRows(
  rows: { month: string; currency: string; impressions: number; clicks: number; ggrUsd: number }[],
): Record<string, MonthlyMetric[]> {
  const buckets = new Map<string, Map<string, MonthlyMetric>>()

  const add = (key: string, month: string, metric: Omit<MonthlyMetric, 'month'>) => {
    if (!buckets.has(key)) buckets.set(key, new Map())
    const byMonth = buckets.get(key)!
    const prev = byMonth.get(month) ?? {
      month,
      impressions: 0,
      clicks: 0,
      ggrUsd: 0,
    }
    byMonth.set(month, {
      month,
      impressions: prev.impressions + metric.impressions,
      clicks: prev.clicks + metric.clicks,
      ggrUsd: prev.ggrUsd + metric.ggrUsd,
    })
  }

  for (const row of rows) {
    add(row.currency, row.month, row)
    add('ALL', row.month, row)
  }

  const out: Record<string, MonthlyMetric[]> = {}
  for (const [key, byMonth] of buckets) {
    out[key] = Array.from(byMonth.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    )
  }
  return out
}

/** Excel monthly footers: month serial in GGR col, SUM(Sstart:Send) in GGR USD. */
function parseMonthlyFooterRanges(
  sheet: XLSX.WorkSheet,
  matrix: (string | number | Date | null)[][],
  ggrCol: number,
  ggrUsdCol: number,
): {
  start: number
  end: number
  month: string
  ggrUsd: number
}[] {
  let grandTotalIdx = -1
  for (let i = 1; i < matrix.length; i++) {
    const label = String(matrix[i]?.[0] ?? '')
      .trim()
      .toLowerCase()
    if (label.includes('grand total')) {
      grandTotalIdx = i
      break
    }
  }
  if (grandTotalIdx < 0) return []

  const ranges: {
    start: number
    end: number
    month: string
    ggrUsd: number
  }[] = []
  for (let i = grandTotalIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    const month = parseMonth(row[ggrCol])
    if (!month) continue
    const ggrUsd = num(row[ggrUsdCol])

    const addr = XLSX.utils.encode_cell({ r: i, c: ggrUsdCol })
    const formula = sheet[addr]?.f
    if (typeof formula === 'string') {
      const match = formula.match(
        /^SUM\(\s*[A-Z]+(\d+)\s*:\s*[A-Z]+(\d+)\s*\)$/i,
      )
      if (match) {
        const start = Number(match[1])
        const end = Number(match[2])
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          ranges.push({ start, end, month, ggrUsd })
          continue
        }
      }
    }
    // Footer total without a parseable SUM (still authoritative for ALL).
    ranges.push({ start: -1, end: -1, month, ggrUsd })
  }
  return ranges
}

function monthFromFooterRanges(
  excelRow: number,
  ranges: { start: number; end: number; month: string }[],
): string | null {
  for (const range of ranges) {
    if (range.start < 0) continue
    if (excelRow >= range.start && excelRow <= range.end) return range.month
  }
  return null
}

function parseSheet(
  sheetName: string,
  sheet: XLSX.WorkSheet,
): {
  id: string
  label: string
  rows: { month: string; currency: string; impressions: number; clicks: number; ggrUsd: number }[]
  footerRanges: { start: number; end: number; month: string; ggrUsd: number }[]
} | null {
  const mapped = resolveBrand(sheetName)
  if (!mapped) return null
  const kind = schemaForSheet(sheetName)
  const cols = colIndexes(kind)
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: null, raw: true },
  )
  if (matrix.length < 2) return null

  // Brand GGR is col R (17); prefer footer SUM ranges so month labels match
  // Excel's monthly GGR USD subtotals (also corrects wrong years in col A).
  const footerRanges =
    kind === 'brand'
      ? parseMonthlyFooterRanges(sheet, matrix, 17, cols.ggrUsd)
      : []

  let carryMonth: string | null = null
  let carryCcy: string | null = null
  const rows: {
    month: string
    currency: string
    impressions: number
    clicks: number
    ggrUsd: number
  }[] = []

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    const monthCell = row[0]
    const ccyCell = row[1]

    // Grand Total + monthly GGR USD subtotals sit after data rows.
    // Subtotals store the month serial in GGR (col R) with empty A/B/C/D —
    // without this stop they are carry-forwarded into the last month and
    // inflate Revenue · GGR USD (often 20–30×).
    if (isFooterLabel(monthCell) && !parseMonth(monthCell)) break

    const website = row[2]
    const name = row[3]
    const hasIdentity =
      (website != null && String(website).trim() !== '') ||
      (name != null && String(name).trim() !== '') ||
      baseCurrency(ccyCell) != null
    if (!hasIdentity) continue

    const monthParsed = parseMonth(monthCell)
    if (monthParsed) carryMonth = monthParsed
    const ccyParsed = baseCurrency(ccyCell)
    if (ccyParsed) carryCcy = ccyParsed

    const excelRow = i + 1
    const footerMonth = monthFromFooterRanges(excelRow, footerRanges)
    // Keep orphan gap rows (between Excel monthly SUM ranges) via carry-forward
    // so all-time totals match Excel Grand Total (SUM of every data row).
    const month = footerMonth ?? carryMonth

    if (!month || !carryCcy) continue

    // Skip pure total rows that still have a month label
    const nameCell = String(row[2] ?? row[3] ?? '').toLowerCase()
    if (nameCell.includes('total') || nameCell.includes('grand')) continue

    const impressions = cols.impressions >= 0 ? num(row[cols.impressions]) : 0
    const clicks = cols.clicks >= 0 ? num(row[cols.clicks]) : 0
    const ggrUsd = num(row[cols.ggrUsd])
    if (impressions === 0 && clicks === 0 && ggrUsd === 0) continue

    rows.push({
      month,
      currency: carryCcy,
      impressions,
      clicks,
      ggrUsd,
    })
  }

  return { id: mapped.id, label: mapped.label, rows, footerRanges }
}

/** Parse a full SEO Performance workbook into the dashboard extract shape. */
export async function parseSeoExcelFile(file: File): Promise<ExcelExtract> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const months = new Set<string>()
  const currencies = new Set<string>()
  const mapping: Record<string, string> = {}
  const brands: ExcelExtract['brands'] = {}
  const data: ExcelExtract['data'] = {}
  const tabOrder: string[] = []

  for (const sheetName of workbook.SheetNames) {
    if (!isBrandSheet(sheetName)) continue
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const parsed = parseSheet(sheetName, sheet)
    if (!parsed || !parsed.rows.length) continue

    const monthly = aggregateRows(parsed.rows)
    const ccyList = Object.keys(monthly)
      .filter((k) => k !== 'ALL')
      .sort()
    for (const m of monthly.ALL ?? []) months.add(m.month)
    for (const c of ccyList) currencies.add(c)

    mapping[parsed.id] = sheetName
    brands[parsed.id] = {
      label: parsed.label,
      currencies: ccyList,
      primaryCurrency: ccyList[0] ?? 'USD',
    }
    data[parsed.id] = monthly
    if (!tabOrder.includes(parsed.id)) tabOrder.push(parsed.id)
  }

  if (!tabOrder.length) {
    throw new Error('No brand sheets with data were found in this workbook.')
  }

  const ordered = sortBrandIds(tabOrder)

  return {
    source: file.name,
    extractedAt: new Date().toISOString(),
    rules: {
      monthColumn: 'A (Month) — carry-forward when blank',
      currencyColumn: 'B (CCY) — base code from value; carry-forward when blank',
    },
    months: Array.from(months).sort(),
    currencies: Array.from(currencies).sort(),
    mapping,
    brands,
    tabOrder: ordered,
    data,
  }
}
