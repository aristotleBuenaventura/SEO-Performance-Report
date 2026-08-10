import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BrandId, CurrencyCode } from '../types'
import {
  exactMonthKey,
  formatPeriodLabel,
  getLatestPeriodDefaults,
  type PerformanceApi,
  type PeriodFilter,
} from '../data/performanceData'
import { FiltersBar } from '../components/FiltersBar'
import { KpiCards } from '../components/KpiCards'
import { TrendChart } from '../components/TrendChart'
import { DonutChart } from '../components/DonutChart'
import { BrandNav } from '../components/BrandNav'
import { useTheme } from '../hooks/useTheme'
import {
  resolveReportFilters,
  writeStoredReportFilters,
} from '../lib/reportFiltersStorage'

interface ReportPageProps {
  api: PerformanceApi
  showAdmin?: boolean
  onLogout?: () => void | Promise<void>
}

export function ReportPage({ api, showAdmin, onLogout }: ReportPageProps) {
  const { theme, setTheme } = useTheme()
  const latestPeriod = useMemo(
    () => getLatestPeriodDefaults(api.months),
    [api.months],
  )

  const [year, setYear] = useState(latestPeriod.year)
  const [month, setMonth] = useState(latestPeriod.month)
  const [brand, setBrand] = useState<BrandId>('summary')
  const [currency, setCurrency] = useState<CurrencyCode | 'all'>('all')
  const [hydrated, setHydrated] = useState(false)

  // Restore saved filters once (and again when Excel data source changes).
  useEffect(() => {
    const next = resolveReportFilters({
      months: api.months,
      yearOptions: api.yearOptions,
      currencyOptions: api.currencyOptions,
      brandIds: api.brandTabs.map((t) => t.id),
      latest: latestPeriod,
    })
    setYear(next.year)
    setMonth(next.month)
    setBrand(next.brand)
    setCurrency(next.currency)
    setHydrated(true)
  }, [api.dataSource, latestPeriod.year, latestPeriod.month, api])

  // Persist selection across refresh (after hydration so we don't overwrite storage with defaults).
  useEffect(() => {
    if (!hydrated) return
    writeStoredReportFilters({ brand, year, month, currency })
  }, [hydrated, brand, year, month, currency])

  const period: PeriodFilter = useMemo(
    () => ({ year, month }),
    [year, month],
  )

  const visibleTabs = useMemo(
    () => api.getBrandTabsForCurrency(currency),
    [api, currency],
  )

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === brand)) {
      setBrand('summary')
    }
  }, [visibleTabs, brand])

  const brandLabel =
    api.brandTabs.find((t) => t.id === brand)?.label ?? 'Summary'

  const chartSeries = useMemo(
    () => api.getBrandMonthly(brand, currency),
    [api, brand, currency],
  )

  const monthly = useMemo(
    () => api.filterByPeriod(chartSeries, period),
    [api, chartSeries, period],
  )

  const trendSeries = useMemo(
    () => api.zoomByPeriod(chartSeries, period, 5),
    [api, chartSeries, period],
  )

  const totals = useMemo(() => api.getTotals(monthly), [api, monthly])

  const revenuePie = useMemo(
    () => api.getRevenueByBrandPeriod(period, currency),
    [api, period, currency],
  )
  const trafficPie = useMemo(
    () => api.getTrafficByBrandPeriod(period, currency),
    [api, period, currency],
  )

  const focusMonth = exactMonthKey(period)
  const isZoomed = !(year === 'all' && month === 'all')

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <img
            className="topbar__logo"
            src="/logo.png"
            alt="MCW"
            width={40}
            height={40}
          />
          <h1>SEO Performance</h1>
        </div>

        <div className="topbar__right">
          <FiltersBar
            year={year}
            month={month}
            currency={currency}
            theme={theme}
            yearOptions={api.yearOptions}
            currencyOptions={api.currencyOptions}
            onYearChange={setYear}
            onMonthChange={setMonth}
            onCurrencyChange={setCurrency}
            onThemeChange={setTheme}
          />
          <div className="topbar__links">
            {showAdmin ? (
              <>
                <Link className="nav-btn nav-btn--admin" to="/admin">
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3 4 7v5c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V7l-8-4Z" />
                    <path d="M9.5 12.5 11 14l3.5-3.5" />
                  </svg>
                  Admin
                </Link>
                {onLogout ? (
                  <button
                    type="button"
                    className="nav-btn nav-btn--logout"
                    onClick={() => void onLogout()}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
                      <path d="M15 12H3" />
                      <path d="m6 9-3 3 3 3" />
                    </svg>
                    Sign out
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="dashboard">
        <BrandNav
          tabs={visibleTabs}
          active={brand}
          onChange={setBrand}
          brandLabel={brandLabel}
          currencyLabel={currency === 'all' ? 'All' : currency}
          impressions={totals.impressions}
          clicks={totals.clicks}
          ggrUsd={totals.ggrUsd}
        />

        <main className="main-panel">
          {api.months.length === 0 ? (
            <p className="empty-report">
              No Excel data uploaded yet. KPIs and charts will appear after an admin uploads a workbook.
            </p>
          ) : null}
          <KpiCards
            impressions={totals.impressions}
            clicks={totals.clicks}
            ggrUsd={totals.ggrUsd}
          />

          <div className="charts-grid">
            <TrendChart
              data={trendSeries}
              zoomedMonth={focusMonth}
              zoomLabel={isZoomed ? formatPeriodLabel(period) : null}
              theme={theme}
            />
            <div className="side-charts">
              <DonutChart
                title="GGR USD"
                data={revenuePie}
                mode="usd"
                theme={theme}
              />
              <DonutChart
                title="Traffic"
                data={trafficPie}
                mode="count"
                credit="Developed by Aris"
                theme={theme}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
