import * as XLSX from 'xlsx'
import type { MonthlyMetric } from '../types'

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

/**
 * Brand sheets only (as in the SEO workbook tabs).
 * Other sheets (Summary, Ads, Blackhat, Phishing, BPM, …) are ignored.
 */
const BRAND_SHEETS = new Set([
  'MCW',
  'B1',
  'B2',
  'K1',
  'B3',
  'B4',
  'G1',
  'TK',
  'BP',
  'JW',
  'NCVIP',
  'M3',
  'C1',
])

function isBrandSheet(sheetName: string): boolean {
  return BRAND_SHEETS.has(sheetName.trim())
}

/** Brand identity comes only from the Excel sheet name. */
function brandFromSheetName(sheetName: string): { id: string; label: string } {
  const label = sheetName.trim() || 'Sheet'
  return { id: slugify(label), label }
}

function schemaForSheet(name: string): SchemaKind {
  const n = name.trim().toLowerCase()
  if (n === 'ads' || n.includes('blackhat')) return 'ads'
  if (n.includes('phishing')) return 'phishing'
  return 'brand'
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sheet'
}

function parseMonth(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
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

function parseSheet(
  sheetName: string,
  sheet: XLSX.WorkSheet,
): {
  id: string
  label: string
  rows: { month: string; currency: string; impressions: number; clicks: number; ggrUsd: number }[]
} | null {
  const mapped = brandFromSheetName(sheetName)
  const kind = schemaForSheet(sheetName)
  const cols = colIndexes(kind)
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: null, raw: true },
  )
  if (matrix.length < 2) return null

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

    if (isFooterLabel(monthCell) && !parseMonth(monthCell)) continue

    const monthParsed = parseMonth(monthCell)
    if (monthParsed) carryMonth = monthParsed
    const ccyParsed = baseCurrency(ccyCell)
    if (ccyParsed) carryCcy = ccyParsed

    if (!carryMonth || !carryCcy) continue

    // Skip pure total rows that still have a month label
    const nameCell = String(row[2] ?? row[3] ?? '').toLowerCase()
    if (nameCell.includes('total') || nameCell.includes('grand')) continue

    const impressions = cols.impressions >= 0 ? num(row[cols.impressions]) : 0
    const clicks = cols.clicks >= 0 ? num(row[cols.clicks]) : 0
    const ggrUsd = num(row[cols.ggrUsd])
    if (impressions === 0 && clicks === 0 && ggrUsd === 0) continue

    rows.push({
      month: carryMonth,
      currency: carryCcy,
      impressions,
      clicks,
      ggrUsd,
    })
  }

  return { id: mapped.id, label: mapped.label, rows }
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

  tabOrder.sort((a, b) => {
    const labelA = brands[a]?.label ?? a
    const labelB = brands[b]?.label ?? b
    return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' })
  })

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
    tabOrder,
    data,
  }
}
