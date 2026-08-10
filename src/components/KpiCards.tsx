import { formatNumber, formatUsd } from '../data/performanceData'

interface KpiCardsProps {
  impressions: number
  clicks: number
  ggrUsd: number
}

const cards = [
  { key: 'clicks', label: 'Clicks', tone: 'teal' },
  { key: 'impressions', label: 'Impressions', tone: 'blue' },
  { key: 'ggrUsd', label: 'GGR USD', tone: 'gold' },
] as const

export function KpiCards({ impressions, clicks, ggrUsd }: KpiCardsProps) {
  const values = { impressions, clicks, ggrUsd }

  return (
    <div className="kpi-row">
      {cards.map((card) => (
        <article key={card.key} className={`kpi-card kpi-card--${card.tone}`}>
          <div className="kpi-card__top">
            <p className="kpi-label">{card.label}</p>
            <span className={`kpi-pulse kpi-pulse--${card.tone}`} />
          </div>
          <p className="kpi-value">
            {card.key === 'ggrUsd'
              ? formatUsd(values.ggrUsd)
              : formatNumber(values[card.key])}
          </p>
        </article>
      ))}
    </div>
  )
}
