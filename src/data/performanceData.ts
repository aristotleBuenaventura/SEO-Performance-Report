import type { BrandData, BrandId, CurrencyCode, MonthlyMetric } from '../types'
import extract from './excelExtract.json'

type ExtractBrandId = Exclude<BrandId, 'summary'>

/**
 * Live data from SEO Performance Report - June 2026.xlsx
 * See extract.mapping for sheet → brand mapping.
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
  return {
    id,
    label: meta.label,
    currency: meta.currency as CurrencyCode,
    monthly: (extract.data as Record<string, MonthlyMetric[]>)[id],
  }
})

/** All months present in the Excel extract (sorted). */
export const MONTHS = extract.months as string[]

export const MONTH_OPTIONS = ['all', ...MONTHS] as const

export const CURRENCY_OPTIONS = ['all', 'USD', 'BDT', 'PHP', 'VND', 'PKR'] as const

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

function brandsForCurrency(currency: CurrencyCode | 'all') {
  if (currency === 'all' || currency === 'USD') return BRAND_DATA
  return BRAND_DATA.filter((b) => b.currency === currency)
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

export function getSummaryMonthly(
  currency: CurrencyCode | 'all' = 'all',
): MonthlyMetric[] {
  const brands = brandsForCurrency(currency)
  return MONTHS.map((month) => {
    const rows = brands.flatMap((b) => b.monthly.filter((m) => m.month === month))
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
  if (currency !== 'all' && currency !== 'USD' && brand.currency !== currency) {
    return alignToMonths([], MONTHS)
  }
  return alignToMonths(brand.monthly, MONTHS)
}

export function filterMonthly(
  rows: MonthlyMetric[],
  month: string,
): MonthlyMetric[] {
  if (month === 'all') return rows
  return rows.filter((r) => r.month === month)
}

export function getTotals(rows: MonthlyMetric[]) {
  return sumMetrics(rows)
}

export function getRevenueByBrand(
  month: string,
  currency: CurrencyCode | 'all' = 'all',
) {
  return brandsForCurrency(currency).map((brand) => {
    const rows = filterMonthly(brand.monthly, month)
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
    const rows = filterMonthly(brand.monthly, month)
    const total = sumMetrics(rows)
    return {
      name: brand.label,
      value: total.impressions,
    }
  })
}
