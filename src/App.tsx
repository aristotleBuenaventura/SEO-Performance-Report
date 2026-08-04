import { useMemo, useState } from 'react'
import type { BrandId, CurrencyCode } from './types'
import {
  BRAND_TABS,
  filterMonthly,
  getBrandMonthly,
  getRevenueByBrand,
  getTotals,
  getTrafficByBrand,
} from './data/dummyData'
import { FiltersBar } from './components/FiltersBar'
import { KpiCards } from './components/KpiCards'
import { SummarySidebar } from './components/SummarySidebar'
import { TrendChart } from './components/TrendChart'
import { DonutChart } from './components/DonutChart'
import { BrandTabs } from './components/BrandTabs'
import './App.css'

function App() {
  const [month, setMonth] = useState('all')
  const [brand, setBrand] = useState<BrandId>('summary')
  const [currency, setCurrency] = useState<CurrencyCode | 'all'>('all')

  const brandLabel = BRAND_TABS.find((t) => t.id === brand)?.label ?? 'Summary'

  const chartSeries = useMemo(
    () => getBrandMonthly(brand, currency),
    [brand, currency],
  )

  const monthly = useMemo(
    () => filterMonthly(chartSeries, month),
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
      <header className="app-header">
        <div>
          <h1>SEO Performance Report</h1>
          <p>Per-brand Impressions, Clicks &amp; GGR USD</p>
        </div>
        <span className="badge">Dark · Dummy data</span>
      </header>

      <div className="dashboard">
        <SummarySidebar
          brandLabel={brandLabel}
          impressions={totals.impressions}
          clicks={totals.clicks}
          ggrUsd={totals.ggrUsd}
        />

        <main className="main-panel">
          <FiltersBar
            month={month}
            brand={brand}
            currency={currency}
            onMonthChange={setMonth}
            onBrandChange={setBrand}
            onCurrencyChange={setCurrency}
          />

          <KpiCards
            impressions={totals.impressions}
            clicks={totals.clicks}
            ggrUsd={totals.ggrUsd}
          />

          <div className="charts-grid">
            <TrendChart data={chartSeries} />
            <div className="side-charts">
              <DonutChart title="Revenue by brand" data={revenuePie} mode="usd" />
              <DonutChart title="Traffic (impressions)" data={trafficPie} mode="count" />
            </div>
          </div>

          <BrandTabs active={brand} onChange={setBrand} />
        </main>
      </div>
    </div>
  )
}

export default App
