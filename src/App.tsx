import { useEffect, useMemo, useState } from 'react'
import type { BrandId, CurrencyCode } from './types'
import {
  BRAND_TABS,
  DATA_SOURCE,
  filterMonthly,
  getBrandMonthly,
  getBrandTabsForCurrency,
  getRevenueByBrand,
  getTotals,
  getTrafficByBrand,
  zoomMonthlySeries,
} from './data/performanceData'
import { FiltersBar } from './components/FiltersBar'
import { KpiCards } from './components/KpiCards'
import { TrendChart } from './components/TrendChart'
import { DonutChart } from './components/DonutChart'
import { BrandNav } from './components/BrandNav'
import './App.css'

function App() {
  const [month, setMonth] = useState('all')
  const [brand, setBrand] = useState<BrandId>('summary')
  const [currency, setCurrency] = useState<CurrencyCode | 'all'>('all')

  const visibleTabs = useMemo(
    () => getBrandTabsForCurrency(currency),
    [currency],
  )

  // If active brand is hidden by currency filter, fall back to Summary
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
    () => filterMonthly(chartSeries, month),
    [chartSeries, month],
  )

  // Trend keeps a line: full series on "all", zoomed window around selected month
  const trendSeries = useMemo(
    () => zoomMonthlySeries(chartSeries, month, 5),
    [chartSeries, month],
  )

  const totals = useMemo(() => getTotals(monthly), [monthly])

  const revenuePie = useMemo(
    () => getRevenueByBrand(month, currency),
    [month, currency],
  )
  const trafficPie = useMemo(
    () => getTrafficByBrand(month, currency),
    [month, currency],
  )

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
          month={month}
          currency={currency}
          onMonthChange={setMonth}
          onCurrencyChange={setCurrency}
        />

        <span className="badge" title={DATA_SOURCE}>
          Live Excel
        </span>
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
            <TrendChart data={trendSeries} zoomedMonth={month === 'all' ? null : month} />
            <div className="side-charts">
              <DonutChart title="Revenue mix" data={revenuePie} mode="usd" />
              <DonutChart title="Traffic mix" data={trafficPie} mode="count" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
