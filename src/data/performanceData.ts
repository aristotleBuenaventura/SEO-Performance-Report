import type {
  BrandData,
  BrandId,
  CurrencyCode,
  MonthlyMetric,
  ReportExtract,
} from '../types'
import {
  getBrandDefinition,
  sortBrandIds,
} from './brands'

export interface PeriodFilter {
  year: string // 'all' | 'YYYY'
  month: string // 'all' | '01'..'12'
}

export const CALENDAR_MONTH_OPTIONS = [
  { value: 'all', label: 'ALL' },
  { value: '01', label: 'JANUARY' },
  { value: '02', label: 'FEBRUARY' },
  { value: '03', label: 'MARCH' },
  { value: '04', label: 'APRIL' },
  { value: '05', label: 'MAY' },
  { value: '06', label: 'JUNE' },
  { value: '07', label: 'JULY' },
  { value: '08', label: 'AUGUST' },
  { value: '09', label: 'SEPTEMBER' },
  { value: '10', label: 'OCTOBER' },
  { value: '11', label: 'NOVEMBER' },
  { value: '12', label: 'DECEMBER' },
] as const

export function getLatestPeriodDefaults(months: string[]): PeriodFilter {
  if (!months.length) return { year: 'all', month: 'all' }
  const latest = months.reduce((a, b) => (a > b ? a : b))
  const [year, month] = latest.split('-')
  return { year, month }
}

export function formatPeriodLabel(period: PeriodFilter): string {
  if (period.year === 'all' && period.month === 'all') return 'ALL PERIODS'
  const monthName =
    CALENDAR_MONTH_OPTIONS.find((m) => m.value === period.month)?.label ?? ''
  if (period.year !== 'all' && period.month !== 'all') {
    return `${monthName} ${period.year}`
  }
  if (period.year !== 'all') return `YEAR ${period.year}`
  return monthName || 'ALL PERIODS'
}

export function exactMonthKey(period: PeriodFilter): string | null {
  if (period.year === 'all' || period.month === 'all') return null
  return `${period.year}-${period.month}`
}

export function formatMonthLabel(month: string): string {
  if (month === 'all') return 'ALL'
  const [y, m] = month.split('-')
  const names = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
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

export function isReportExtract(value: unknown): value is ReportExtract {
  if (!value || typeof value !== 'object') return false
  const v = value as ReportExtract
  return Boolean(v.data && v.tabOrder && v.brands && v.months && v.currencies)
}

export function createPerformanceApi(extract: ReportExtract) {
  const tabOrder = sortBrandIds(
    extract.tabOrder.filter((id) => extract.brands[id] || extract.data[id]),
  )

  function brandLabel(id: string, fallback?: string): string {
    return getBrandDefinition(id)?.label ?? fallback ?? extract.brands[id]?.label ?? id
  }

  const brandTabs: {
    id: BrandId
    label: string
  }[] = [
    { id: 'summary', label: 'SUMMARY' },
    ...tabOrder.map((id) => ({
      id,
      label: brandLabel(id),
    })),
  ]

  const brandData: BrandData[] = tabOrder.map((id) => {
    const meta = extract.brands[id]
    const raw = extract.data[id] ?? {}
    return {
      id,
      label: brandLabel(id, meta?.label),
      currencies: meta?.currencies ?? [],
      monthlyByCurrency: raw,
    }
  })

  const months = extract.months
  const yearOptions = [
    'all',
    ...Array.from(
      new Set([
        ...months.map((m) => m.slice(0, 4)),
        String(new Date().getFullYear()),
      ]),
    ).sort(),
  ]
  const currencyOptions = ['all', ...extract.currencies]

  function brandSeries(
    brand: BrandData,
    currency: CurrencyCode | 'all',
  ): MonthlyMetric[] {
    if (currency === 'all') return brand.monthlyByCurrency.ALL ?? []
    return brand.monthlyByCurrency[currency] ?? []
  }

  function brandsForCurrency(currency: CurrencyCode | 'all'): BrandData[] {
    if (currency === 'all') return brandData
    return brandData.filter((b) => b.currencies.includes(currency))
  }

  function getBrandTabsForCurrency(currency: CurrencyCode | 'all') {
    if (currency === 'all') return brandTabs
    return [
      { id: 'summary', label: 'SUMMARY' },
      ...brandData
        .filter((b) => b.currencies.includes(currency))
        .map((b) => ({
          id: b.id,
          label: b.label,
        })),
    ]
  }

  function getSummaryMonthly(
    currency: CurrencyCode | 'all' = 'all',
  ): MonthlyMetric[] {
    const brands = brandsForCurrency(currency)
    return months.map((month) => {
      const rows = brands.flatMap((b) =>
        brandSeries(b, currency).filter((m) => m.month === month),
      )
      return { ...sumMetrics(rows), month }
    })
  }

  function getBrandMonthly(
    brandId: BrandId,
    currency: CurrencyCode | 'all' = 'all',
  ): MonthlyMetric[] {
    if (brandId === 'summary') return getSummaryMonthly(currency)
    const brand = brandData.find((b) => b.id === brandId)
    if (!brand) return []
    if (currency !== 'all' && !brand.currencies.includes(currency)) {
      return alignToMonths([], months)
    }
    return alignToMonths(brandSeries(brand, currency), months)
  }

  function filterByPeriod(
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

  function zoomMonthlySeries(
    rows: MonthlyMetric[],
    month: string,
    pad = 5,
  ): MonthlyMetric[] {
    if (month === 'all') return rows
    const idx = rows.findIndex((r) => r.month === month)
    if (idx < 0) return rows.filter((r) => r.month === month)
    const start = Math.max(0, idx - pad)
    const end = Math.min(rows.length, idx + pad + 1)
    return rows.slice(start, end)
  }

  function zoomByPeriod(
    rows: MonthlyMetric[],
    period: PeriodFilter,
    pad = 5,
  ): MonthlyMetric[] {
    const exact = exactMonthKey(period)
    if (exact) return zoomMonthlySeries(rows, exact, pad)
    if (period.year === 'all' && period.month === 'all') return rows
    const filtered = filterByPeriod(rows, period)
    return filtered.length > 0 ? filtered : rows
  }

  function getTotals(rows: MonthlyMetric[]) {
    return sumMetrics(rows)
  }

  function getRevenueByBrandPeriod(
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

  function getTrafficByBrandPeriod(
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

  return {
    dataSource: extract.source,
    brandTabs,
    brandData,
    months,
    yearOptions,
    currencyOptions,
    getBrandTabsForCurrency,
    getBrandMonthly,
    filterByPeriod,
    zoomByPeriod,
    getTotals,
    getRevenueByBrandPeriod,
    getTrafficByBrandPeriod,
  }
}

export type PerformanceApi = ReturnType<typeof createPerformanceApi>

/** Empty extract — used when no Excel has been uploaded / after delete. */
export const EMPTY_EXTRACT: ReportExtract = {
  source: 'No data uploaded',
  extractedAt: new Date(0).toISOString(),
  months: [],
  currencies: [],
  brands: {},
  tabOrder: [],
  data: {},
}

export const defaultPerformanceApi = createPerformanceApi(EMPTY_EXTRACT)

/** Kept for FiltersBar option lists / legacy imports. */
export const YEAR_OPTIONS = defaultPerformanceApi.yearOptions
export const CURRENCY_OPTIONS = defaultPerformanceApi.currencyOptions
export const BRAND_TABS = defaultPerformanceApi.brandTabs
export const DATA_SOURCE = defaultPerformanceApi.dataSource
