import { formatNumber, formatUsd } from '../data/dummyData'

interface KpiCardsProps {
  impressions: number
  clicks: number
  ggrUsd: number
}

export function KpiCards({ impressions, clicks, ggrUsd }: KpiCardsProps) {
  return (
    <div className="kpi-row">
      <article className="kpi-card">
        <p className="kpi-label">Impressions</p>
        <p className="kpi-value">{formatNumber(impressions)}</p>
      </article>
      <article className="kpi-card">
        <p className="kpi-label">Clicks</p>
        <p className="kpi-value">{formatNumber(clicks)}</p>
      </article>
      <article className="kpi-card kpi-card--accent">
        <p className="kpi-label">Revenue (GGR USD)</p>
        <p className="kpi-value">{formatUsd(ggrUsd)}</p>
      </article>
    </div>
  )
}
