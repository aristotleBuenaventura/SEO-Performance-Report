import type { BrandData, BrandId, CurrencyCode, MonthlyMetric } from '../types'
import extract from './excelExtract.json'

type ExtractBrandId = Exclude<BrandId, 'summary'>

/**
 * Excel rules (SEO Performance Report - June 2026.xlsx):
 * - Column A = Month (carry-forward when blank)
 * - Column B = CCY / currency (base code; carry-forward when blank)
 */
export const DATA_SOURCE = extract.source

const tabOrder = extract.tabOrder as ExtractBrandId[]

export const BRAND_TABS: { id: BrandId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  ...tabOrder.map((id) => ({
    id,
    label: extract.brands[id as keyof typeof extract.brands].label,
  })),
]

export const BRAND_DATA: BrandData[] = tabOrder.map((id) => {
  const meta = extract.brands[id as keyof typeof extract.brands]
  const raw = (extract.data as Record<string, Record<string, MonthlyMetric[]>>)[id]
  return {
    id,
    label: meta.label,
    currencies: meta.currencies as string[],
    monthlyByCurrency: raw,
  }
})

/** All months from column A across the workbook. */
export const MONTHS = extract.months as string[]

export const MONTH_OPTIONS = ['all', ...MONTHS] as const

/** Distinct years from column A (YYYY-MM), plus the current calendar year. */
export const YEAR_OPTIONS = [
  'all',
  ...Array.from(
    new Set([
      ...MONTHS.map((m) => m.slice(0, 4)),
      String(new Date().getFullYear()),
    ]),
  ).sort(),
] as const

/** Calendar months (01–12) for the Month filter. */
export const CALENDAR_MONTH_OPTIONS = [
  { value: 'all', label: 'All months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

/** Default filters: current calendar year + month. */
export function getCurrentPeriodDefaults(): PeriodFilter {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return { year, month }
}

export interface PeriodFilter {
  year: string // 'all' | 'YYYY'
  month: string // 'all' | '01'..'12'
}

export function formatPeriodLabel(period: PeriodFilter): string {
  if (period.year === 'all' && period.month === 'all') return 'All periods'
  const monthName =
    CALENDAR_MONTH_OPTIONS.find((m) => m.value === period.month)?.label ?? ''
  if (period.year !== 'all' && period.month !== 'all') {
    return `${monthName} ${period.year}`
  }
  if (period.year !== 'all') return `Year ${period.year}`
  return monthName || 'All periods'
}

/** Exact YYYY-MM when both year + month are set; otherwise null. */
export function exactMonthKey(period: PeriodFilter): string | null {
  if (period.year === 'all' || period.month === 'all') return null
  return `${period.year}-${period.month}`
}

/** Distinct currencies from column B. */
export const CURRENCY_OPTIONS = ['all', ...(extract.currencies as string[])] as const

export function getBrandTabsForCurrency(
  currency: CurrencyCode | 'all',
): { id: BrandId; label: string }[] {
  if (currency === 'all') return BRAND_TABS
  return [
    { id: 'summary', label: 'Summary' },
    ...BRAND_DATA.filter((b) => b.currencies.includes(currency)).map((b) => ({
      id: b.id,
      label: b.label,
    })),
  ]
}

export function formatMonthLabel(month: string): string {
  if (month === 'all') return 'All months'
  const [y, m] = month.split('-')
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${names[Number(m) - 1]} ${y}`
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function sumMetrics(rows: MonthlyMetric[]): MonthlyMetric {
  return rows.reduce(
    (acc, row) => ({
      month: acc.month,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      ggrUsd: acc.ggrUsd + row.ggrUsd,
    }),
    { month: 'total', impressions: 0, clicks: 0, ggrUsd: 0 },
  )
}

function alignToMonths(
  rows: MonthlyMetric[],
  months: string[],
): MonthlyMetric[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  return months.map(
    (month) =>
      byMonth.get(month) ?? {
        month,
        impressions: 0,
        clicks: 0,
        ggrUsd: 0,
      },
  )
}

function brandSeries(
  brand: BrandData,
  currency: CurrencyCode | 'all',
): MonthlyMetric[] {
  if (currency === 'all') return brand.monthlyByCurrency.ALL ?? []
  return brand.monthlyByCurrency[currency] ?? []
}

function brandsForCurrency(currency: CurrencyCode | 'all'): BrandData[] {
  if (currency === 'all') return BRAND_DATA
  return BRAND_DATA.filter((b) => b.currencies.includes(currency))
}

export function getSummaryMonthly(
  currency: CurrencyCode | 'all' = 'all',
): MonthlyMetric[] {
  const brands = brandsForCurrency(currency)
  return MONTHS.map((month) => {
    const rows = brands.flatMap((b) =>
      brandSeries(b, currency).filter((m) => m.month === month),
    )
    return { ...sumMetrics(rows), month }
  })
}

export function getBrandMonthly(
  brandId: BrandId,
  currency: CurrencyCode | 'all' = 'all',
): MonthlyMetric[] {
  if (brandId === 'summary') return getSummaryMonthly(currency)
  const brand = BRAND_DATA.find((b) => b.id === brandId)
  if (!brand) return []
  if (currency !== 'all' && !brand.currencies.includes(currency)) {
    return alignToMonths([], MONTHS)
  }
  return alignToMonths(brandSeries(brand, currency), MONTHS)
}

export function filterMonthly(
  rows: MonthlyMetric[],
  month: string,
): MonthlyMetric[] {
  if (month === 'all') return rows
  return rows.filter((r) => r.month === month)
}

/** Filter by separate Year + Month dropdowns. */
export function filterByPeriod(
  rows: MonthlyMetric[],
  period: PeriodFilter,
): MonthlyMetric[] {
  return rows.filter((r) => {
    const [y, m] = r.month.split('-')
    if (period.year !== 'all' && y !== period.year) return false
    if (period.month !== 'all' && m !== period.month) return false
    return true
  })
}

/**
 * Zoom trend window around a selected month while keeping a visible line.
 * `pad` = months before/after the focus month (default 5 → up to 11 points).
 */
export function zoomMonthlySeries(
  rows: MonthlyMetric[],
  month: string,
  pad = 5,
): MonthlyMetric[] {
  if (month === 'all') return rows
  const idx = rows.findIndex((r) => r.month === month)
  if (idx < 0) return filterMonthly(rows, month)
  const start = Math.max(0, idx - pad)
  const end = Math.min(rows.length, idx + pad + 1)
  return rows.slice(start, end)
}

/** Trend series for Year/Month filters — keeps a visible line when zoomed. */
export function zoomByPeriod(
  rows: MonthlyMetric[],
  period: PeriodFilter,
  pad = 5,
): MonthlyMetric[] {
  const exact = exactMonthKey(period)
  if (exact) return zoomMonthlySeries(rows, exact, pad)
  if (period.year === 'all' && period.month === 'all') return rows
  // Year-only or month-only: show the filtered stretch as the zoomed view
  const filtered = filterByPeriod(rows, period)
  return filtered.length > 0 ? filtered : rows
}

export function getTotals(rows: MonthlyMetric[]) {
  return sumMetrics(rows)
}

export function getRevenueByBrand(
  month: string,
  currency: CurrencyCode | 'all' = 'all',
) {
  return brandsForCurrency(currency).map((brand) => {
    const rows = filterMonthly(brandSeries(brand, currency), month)
    const total = sumMetrics(rows)
    return {
      name: brand.label,
      value: Math.round(total.ggrUsd),
    }
  })
}

export function getRevenueByBrandPeriod(
  period: PeriodFilter,
  currency: CurrencyCode | 'all' = 'all',
) {
  return brandsForCurrency(currency).map((brand) => {
    const rows = filterByPeriod(brandSeries(brand, currency), period)
    const total = sumMetrics(rows)
    return {
      name: brand.label,
      value: Math.round(total.ggrUsd),
    }
  })
}

export function getTrafficByBrand(
  month: string,
  currency: CurrencyCode | 'all' = 'all',
) {
  return brandsForCurrency(currency).map((brand) => {
    const rows = filterMonthly(brandSeries(brand, currency), month)
    const total = sumMetrics(rows)
    return {
      name: brand.label,
      value: total.impressions,
    }
  })
}

export function getTrafficByBrandPeriod(
  period: PeriodFilter,
  currency: CurrencyCode | 'all' = 'all',
) {
  return brandsForCurrency(currency).map((brand) => {
    const rows = filterByPeriod(brandSeries(brand, currency), period)
    const total = sumMetrics(rows)
    return {
      name: brand.label,
      value: total.impressions,
    }
  })
}
