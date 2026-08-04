import type { BrandId } from '../types'
import { BRAND_TABS } from '../data/dummyData'

interface BrandTabsProps {
  active: BrandId
  onChange: (brand: BrandId) => void
}

export function BrandTabs({ active, onChange }: BrandTabsProps) {
  return (
    <nav className="brand-tabs" aria-label="Brand">
      {BRAND_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? 'brand-tab active' : 'brand-tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
