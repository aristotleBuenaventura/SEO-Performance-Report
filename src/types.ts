/** Brand tab id — 'summary' or a sheet-derived brand key. */
export type BrandId = string

/** Base currency codes from Excel column B (CCY). */
export type CurrencyCode = string

export interface MonthlyMetric {
  month: string // YYYY-MM from column A
  impressions: number
  clicks: number
  ggrUsd: number
}

export interface BrandData {
  id: BrandId
  label: string
  /** Currencies present in column B for this brand */
  currencies: string[]
  /** monthly[currencyCode | 'ALL'] */
  monthlyByCurrency: Record<string, MonthlyMetric[]>
}

export interface DashboardFilters {
  month: string // 'all' | YYYY-MM
  brand: BrandId
  currency: CurrencyCode | 'all'
}

export interface ReportExtract {
  source: string
  extractedAt?: string
  uploadedAt?: string
  uploadedBy?: string
  rules?: {
    monthColumn: string
    currencyColumn: string
  }
  months: string[]
  currencies: string[]
  mapping?: Record<string, string>
  brands: Record<
    string,
    { label: string; currencies: string[]; primaryCurrency?: string }
  >
  tabOrder: string[]
  data: Record<string, Record<string, MonthlyMetric[]>>
}
