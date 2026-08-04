import { formatNumber, formatUsd } from '../data/dummyData'

interface SummarySidebarProps {
  impressions: number
  clicks: number
  ggrUsd: number
  brandLabel: string
}

export function SummarySidebar({
  impressions,
  clicks,
  ggrUsd,
  brandLabel,
}: SummarySidebarProps) {
  return (
    <aside className="summary-sidebar">
      <h2>Summary</h2>
      <p className="summary-scope">{brandLabel}</p>
      <div className="summary-metrics">
        <div>
          <span>Total Impressions</span>
          <strong>{formatNumber(impressions)}</strong>
        </div>
        <div>
          <span>Total Clicks</span>
          <strong>{formatNumber(clicks)}</strong>
        </div>
        <div>
          <span>Total Revenue</span>
          <strong>{formatUsd(ggrUsd)}</strong>
        </div>
      </div>
      <p className="summary-note">Dummy data — replace via Excel upload later</p>
    </aside>
  )
}
