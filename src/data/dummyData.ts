import type { BrandData, BrandId, CurrencyCode, MonthlyMetric } from '../types'

/**
 * Dummy performance data — replace later with Excel/CSV upload import.
 * Metrics per brand: Impressions, Clicks, GGR (USD)
 */
const MONTHS = [
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
] as const

function series(
  seed: number,
  impressionsBase: number,
  clicksBase: number,
  ggrBase: number,
): MonthlyMetric[] {
  return MONTHS.map((month, i) => {
    const wave = 1 + 0.15 * Math.sin((i + seed) * 0.7)
    const trend = 1 + i * 0.04
    return {
      month,
      impressions: Math.round(impressionsBase * wave * trend),
      clicks: Math.round(clicksBase * wave * trend),
      ggrUsd: Math.round(ggrBase * wave * trend * 100) / 100,
    }
  })
}

/** Brand tabs order (matches wireframe) */
export const BRAND_TABS: { id: BrandId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'mcw', label: 'MCW' },
  { id: 'mxw', label: 'MXW' },
  { id: 'banglabet', label: 'Banglabet' },
  { id: 'bengalbet', label: 'Bengalbet' },
  { id: 'khela', label: 'Khela' },
  { id: 'bpm', label: 'BPM' },
]

export const BRAND_DATA: BrandData[] = [
  {
    id: 'mcw',
    label: 'MCW',
    currency: 'BDT',
    monthly: series(1, 420000, 18500, 82000),
  },
  {
    id: 'mxw',
    label: 'MXW',
    currency: 'BDT',
    monthly: series(2, 210000, 9200, 31000),
  },
  {
    id: 'banglabet',
    label: 'Banglabet',
    currency: 'BDT',
    monthly: series(3, 175000, 7800, 24500),
  },
  {
    id: 'bengalbet',
    label: 'Bengalbet',
    currency: 'BDT',
    monthly: series(4, 98000, 4100, 12800),
  },
  {
    id: 'khela',
    label: 'Khela',
    currency: 'BDT',
    monthly: series(5, 64000, 2900, 8600),
  },
  {
    id: 'bpm',
    label: 'BPM',
    currency: 'PHP',
    monthly: series(6, 88000, 5200, 15200),
  },
]

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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
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

/** Aggregate all brands into one monthly series (Summary). */
export function getSummaryMonthly(currency: CurrencyCode | 'all' = 'all'): MonthlyMetric[] {
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
    return brand.monthly.map((m) => ({
      ...m,
      impressions: 0,
      clicks: 0,
      ggrUsd: 0,
    }))
  }
  return brand.monthly
}

export function filterMonthly(rows: MonthlyMetric[], month: string): MonthlyMetric[] {
  if (month === 'all') return rows
  return rows.filter((r) => r.month === month)
}

export function getTotals(rows: MonthlyMetric[]) {
  return sumMetrics(rows)
}

/** Pie: GGR USD share per brand (for selected month or all). */
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

/** Pie: traffic share (impressions) per brand. */
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
