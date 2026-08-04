export type BrandId =
  | 'summary'
  | 'mcw'
  | 'mxw'
  | 'banglabet'
  | 'bengalbet'
  | 'khela'
  | 'bpm'

export type CurrencyCode = 'USD' | 'BDT' | 'PHP' | 'VND' | 'PKR'

export interface MonthlyMetric {
  month: string // YYYY-MM
  impressions: number
  clicks: number
  ggrUsd: number
}

export interface BrandData {
  id: BrandId
  label: string
  currency: CurrencyCode
  monthly: MonthlyMetric[]
}

export interface DashboardFilters {
  month: string // 'all' | YYYY-MM
  brand: BrandId
  currency: CurrencyCode | 'all'
}
