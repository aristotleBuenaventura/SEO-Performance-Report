import type { BrandId } from '../types'
import { BRAND_TABS, formatNumber, formatUsd } from '../data/performanceData'

interface BrandNavProps {
  active: BrandId
  onChange: (brand: BrandId) => void
  impressions: number
  clicks: number
  ggrUsd: number
  brandLabel: string
}

export function BrandNav({
  active,
  onChange,
  impressions,
  clicks,
  ggrUsd,
  brandLabel,
}: BrandNavProps) {
  return (
    <aside className="brand-nav">
      <div className="brand-nav__totals">
        <p className="brand-nav__eyebrow">Active view</p>
        <h2>{brandLabel}</h2>
        <dl className="brand-nav__stats">
          <div>
            <dt>Impressions</dt>
            <dd>{formatNumber(impressions)}</dd>
          </div>
          <div>
            <dt>Clicks</dt>
            <dd>{formatNumber(clicks)}</dd>
          </div>
          <div>
            <dt>GGR USD</dt>
            <dd>{formatUsd(ggrUsd)}</dd>
          </div>
        </dl>
      </div>

      <p className="brand-nav__section">Brands</p>
      <nav className="brand-nav__list" aria-label="Brands">
        {BRAND_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={active === tab.id ? 'brand-nav__item active' : 'brand-nav__item'}
            onClick={() => onChange(tab.id)}
          >
            <span className="brand-nav__dot" />
            {tab.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
