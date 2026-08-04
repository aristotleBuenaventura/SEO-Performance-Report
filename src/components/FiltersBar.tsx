import type { BrandId, CurrencyCode } from '../types'
import { BRAND_TABS, CURRENCY_OPTIONS, MONTH_OPTIONS, formatMonthLabel } from '../data/dummyData'

interface FiltersBarProps {
  month: string
  brand: BrandId
  currency: CurrencyCode | 'all'
  onMonthChange: (month: string) => void
  onBrandChange: (brand: BrandId) => void
  onCurrencyChange: (currency: CurrencyCode | 'all') => void
}

export function FiltersBar({
  month,
  brand,
  currency,
  onMonthChange,
  onBrandChange,
  onCurrencyChange,
}: FiltersBarProps) {
  return (
    <div className="filters">
      <label className="filter">
        <span>Month</span>
        <select value={month} onChange={(e) => onMonthChange(e.target.value)}>
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m)}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Brand</span>
        <select
          value={brand}
          onChange={(e) => onBrandChange(e.target.value as BrandId)}
        >
          {BRAND_TABS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Currency</span>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode | 'all')}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? 'All' : c}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
