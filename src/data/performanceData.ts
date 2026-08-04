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
