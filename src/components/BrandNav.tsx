import { useEffect, useRef } from 'react'
import type { BrandId } from '../types'
import { formatNumber, formatUsd } from '../data/performanceData'
import { brandLogoUrl } from '../data/brands'

interface BrandNavProps {
  tabs: { id: BrandId; label: string }[]
  active: BrandId
  onChange: (brand: BrandId) => void
  impressions: number
  clicks: number
  ggrUsd: number
  brandLabel: string
  currencyLabel: string
}

export function BrandNav({
  tabs,
  active,
  onChange,
  impressions,
  clicks,
  ggrUsd,
  brandLabel,
  currencyLabel,
}: BrandNavProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const activeLogo = brandLogoUrl(active)

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [active])

  return (
    <aside className="brand-nav">
      <div className="brand-nav__totals">
        <p className="brand-nav__eyebrow">Active view</p>
        <h2 className="brand-nav__title">
          <span className="brand-nav__title-text">{brandLabel}</span>
          {active !== 'summary' ? (
            activeLogo ? (
              <img
                className="brand-nav__title-logo"
                src={activeLogo}
                alt=""
              />
            ) : (
              <span
                className="brand-nav__title-logo brand-nav__title-logo--empty"
                aria-hidden="true"
              />
            )
          ) : null}
        </h2>
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

      <p className="brand-nav__section">
        Brands{currencyLabel !== 'All' ? ` · ${currencyLabel}` : ''}
      </p>
      <nav className="brand-nav__list" aria-label="Brands">
        {tabs.map((tab) => {
          const logo = brandLogoUrl(tab.id)
          return (
            <button
              key={tab.id}
              type="button"
              ref={tab.id === active ? activeRef : undefined}
              className={
                active === tab.id ? 'brand-nav__item active' : 'brand-nav__item'
              }
              aria-label={tab.label}
              title={tab.label}
              onClick={() => onChange(tab.id)}
            >
              {tab.id === 'summary' ? (
                <span className="brand-nav__all">All</span>
              ) : logo ? (
                <img className="brand-nav__logo" src={logo} alt="" />
              ) : (
                <span
                  className="brand-nav__logo brand-nav__logo--empty"
                  aria-hidden="true"
                />
              )}
              <span className="brand-nav__name">{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
