import { useEffect, useMemo, useState } from 'react'
import type { BrandId, CurrencyCode } from './types'
import {
  BRAND_TABS,
  exactMonthKey,
  filterByPeriod,
  formatPeriodLabel,
  getBrandMonthly,
  getBrandTabsForCurrency,
  getRevenueByBrandPeriod,
  getTotals,
  getTrafficByBrandPeriod,
  zoomByPeriod,
  type PeriodFilter,
} from './data/performanceData'
import { FiltersBar } from './components/FiltersBar'
import { KpiCards } from './components/KpiCards'
import { TrendChart } from './components/TrendChart'
import { DonutChart } from './components/DonutChart'
import { BrandNav } from './components/BrandNav'
import { useTheme } from './hooks/useTheme'
import './App.css'

function App() {
  const { theme, setTheme } = useTheme()
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [brand, setBrand] = useState<BrandId>('summary')
  const [currency, setCurrency] = useState<CurrencyCode | 'all'>('all')

  const period: PeriodFilter = useMemo(
    () => ({ year, month }),
    [year, month],
  )

  const visibleTabs = useMemo(
    () => getBrandTabsForCurrency(currency),
    [currency],
  )

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === brand)) {
      setBrand('summary')
    }
  }, [visibleTabs, brand])

  const brandLabel = BRAND_TABS.find((t) => t.id === brand)?.label ?? 'Summary'

  const chartSeries = useMemo(
    () => getBrandMonthly(brand, currency),
    [brand, currency],
  )

  const monthly = useMemo(
    () => filterByPeriod(chartSeries, period),
    [chartSeries, period],
  )

  const trendSeries = useMemo(
    () => zoomByPeriod(chartSeries, period, 5),
    [chartSeries, period],
  )

  const totals = useMemo(() => getTotals(monthly), [monthly])

  const revenuePie = useMemo(
    () => getRevenueByBrandPeriod(period, currency),
    [period, currency],
  )
  const trafficPie = useMemo(
    () => getTrafficByBrandPeriod(period, currency),
    [period, currency],
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
          <div>
            <h1>SEO Performance</h1>
            <p>Impressions · Clicks · GGR USD</p>
          </div>
        </div>

        <FiltersBar
          year={year}
          month={month}
          currency={currency}
          theme={theme}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onCurrencyChange={setCurrency}
          onThemeChange={setTheme}
        />
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
                title="Revenue mix"
                data={revenuePie}
                mode="usd"
                theme={theme}
              />
              <DonutChart
                title="Traffic mix"
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

export default App
