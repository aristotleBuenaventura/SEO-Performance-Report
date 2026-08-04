export type BrandId =
  | 'summary'
  | 'mcw'
  | 'mxw'
  | 'banglabet'
  | 'bengalbet'
  | 'khela'
  | 'banglaslots'
  | 'banglawin'
  | 'ga888'
  | 'tkbaazi'
  | 'banglaplus'
  | 'joywin'
  | 'ncvip'
  | 'mnlbet'
  | 'cf789'
  | 'bpm'
  | 'ads'
  | 'blackhat'
  | 'phishing'

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
