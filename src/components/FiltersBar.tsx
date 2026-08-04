import type { CurrencyCode } from '../types'
import {
  CALENDAR_MONTH_OPTIONS,
  CURRENCY_OPTIONS,
  YEAR_OPTIONS,
} from '../data/performanceData'

interface FiltersBarProps {
  year: string
  month: string
  currency: CurrencyCode | 'all'
  onYearChange: (year: string) => void
  onMonthChange: (month: string) => void
  onCurrencyChange: (currency: CurrencyCode | 'all') => void
}

export function FiltersBar({
  year,
  month,
  currency,
  onYearChange,
  onMonthChange,
  onCurrencyChange,
}: FiltersBarProps) {
  return (
    <div className="filters">
      <label className="filter">
        <span>Year</span>
        <select value={year} onChange={(e) => onYearChange(e.target.value)}>
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y === 'all' ? 'All years' : y}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Month</span>
        <select value={month} onChange={(e) => onMonthChange(e.target.value)}>
          {CALENDAR_MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
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
