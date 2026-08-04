import type { CurrencyCode } from '../types'
import { CURRENCY_OPTIONS, MONTH_OPTIONS, formatMonthLabel } from '../data/performanceData'

interface FiltersBarProps {
  month: string
  currency: CurrencyCode | 'all'
  onMonthChange: (month: string) => void
  onCurrencyChange: (currency: CurrencyCode | 'all') => void
}

export function FiltersBar({
  month,
  currency,
  onMonthChange,
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
