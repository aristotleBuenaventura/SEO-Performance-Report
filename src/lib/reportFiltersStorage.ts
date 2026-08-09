import type { BrandId, CurrencyCode } from '../types'
import type { PeriodFilter } from '../data/performanceData'

const STORAGE_KEY = 'seo-report-filters'

export interface StoredReportFilters {
  brand: BrandId
  year: string
  month: string
  currency: CurrencyCode | 'all'
}

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

export function readStoredReportFilters(): Partial<StoredReportFilters> {
  if (!canUseStorage()) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<StoredReportFilters>
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      brand: typeof parsed.brand === 'string' ? parsed.brand : undefined,
      year: typeof parsed.year === 'string' ? parsed.year : undefined,
      month: typeof parsed.month === 'string' ? parsed.month : undefined,
      currency:
        typeof parsed.currency === 'string' ? parsed.currency : undefined,
    }
  } catch {
    return {}
  }
}

export function writeStoredReportFilters(filters: StoredReportFilters): void {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    /* ignore quota / private mode */
  }
}

function isMonthValue(value: string): boolean {
  return value === 'all' || /^(0[1-9]|1[0-2])$/.test(value)
}

/** Restore saved filters when still valid; otherwise fall back to latest defaults. */
export function resolveReportFilters(options: {
  months: string[]
  yearOptions: string[]
  currencyOptions: string[]
  brandIds: string[]
  latest: PeriodFilter
}): StoredReportFilters {
  const stored = readStoredReportFilters()
  const brandSet = new Set(options.brandIds)

  let year =
    stored.year && options.yearOptions.includes(stored.year)
      ? stored.year
      : options.latest.year

  let month =
    stored.month && isMonthValue(stored.month)
      ? stored.month
      : options.latest.month

  if (year !== 'all' && month !== 'all' && options.months.length > 0) {
    const key = `${year}-${month}`
    if (!options.months.includes(key)) {
      year = options.latest.year
      month = options.latest.month
    }
  }

  const brand =
    stored.brand && (stored.brand === 'summary' || brandSet.has(stored.brand))
      ? stored.brand
      : 'summary'

  const currency =
    stored.currency && options.currencyOptions.includes(stored.currency)
      ? (stored.currency as CurrencyCode | 'all')
      : 'all'

  return { brand, year, month, currency }
}
