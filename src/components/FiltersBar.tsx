import type { CurrencyCode } from '../types'
import { CALENDAR_MONTH_OPTIONS } from '../data/performanceData'
import type { ThemeMode } from '../hooks/useTheme'
import { FilterSelect } from './FilterSelect'

interface FiltersBarProps {
  year: string
  month: string
  currency: CurrencyCode | 'all'
  theme: ThemeMode
  yearOptions: string[]
  currencyOptions: string[]
  onYearChange: (year: string) => void
  onMonthChange: (month: string) => void
  onCurrencyChange: (currency: CurrencyCode | 'all') => void
  onThemeChange: (theme: ThemeMode) => void
}

export function FiltersBar({
  year,
  month,
  currency,
  theme,
  yearOptions,
  currencyOptions,
  onYearChange,
  onMonthChange,
  onCurrencyChange,
  onThemeChange,
}: FiltersBarProps) {
  return (
    <div className="filters">
      <label className="filter">
        <span>Year</span>
        <FilterSelect
          aria-label="Year"
          value={year}
          onChange={onYearChange}
          options={yearOptions.map((y) => ({
            value: y,
            label: y === 'all' ? 'All' : y,
          }))}
        />
      </label>

      <label className="filter">
        <span>Month</span>
        <FilterSelect
          aria-label="Month"
          value={month}
          onChange={onMonthChange}
          options={CALENDAR_MONTH_OPTIONS.map((m) => ({
            value: m.value,
            label: m.label,
          }))}
        />
      </label>

      <label className="filter">
        <span>Currency</span>
        <FilterSelect
          aria-label="Currency"
          value={currency}
          onChange={(v) => onCurrencyChange(v as CurrencyCode | 'all')}
          options={currencyOptions.map((c) => ({
            value: c,
            label: c === 'all' ? 'All' : c,
          }))}
        />
      </label>

      <label className="filter">
        <span>Theme</span>
        <FilterSelect
          aria-label="Theme"
          value={theme}
          onChange={(v) => onThemeChange(v as ThemeMode)}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </label>
    </div>
  )
}
