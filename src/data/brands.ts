/**
 * Canonical brand list for the SEO report.
 * Excel sheets outside this set are ignored on upload.
 * Display order is fixed (not alphabetical).
 * Logos are served from /brands/ (No-BG) in both themes.
 */
export interface BrandDefinition {
  /** Excel sheet code, e.g. B1 */
  code: string
  /** Stable id used in extracts / routes */
  id: string
  /** Full display name */
  label: string
  /** Filename under /brands/, or null when no logo yet */
  logo: string | null
}

export const BRAND_DEFINITIONS: readonly BrandDefinition[] = [
  { code: 'MCW', id: 'mcw', label: 'MEGA CASINO WORLD', logo: 'mcw-.png' },
  { code: 'MXW', id: 'mxw', label: 'MEGA CRICKET WORLD', logo: 'mxw.png' },
  { code: 'B1', id: 'b1', label: 'BANGLABET', logo: 'b1.png' },
  { code: 'B2', id: 'b2', label: 'BENGALBET', logo: 'b2.png' },
  { code: 'K1', id: 'k1', label: 'KHELAGHOR', logo: 'k1.png' },
  { code: 'B3', id: 'b3', label: 'DESHISLOTS', logo: 'deshislots.png' },
  { code: 'B4', id: 'b4', label: 'BANGLAWIN', logo: 'b4.png' },
  { code: 'G1', id: 'g1', label: 'GA888', logo: 'g1.png' },
  { code: 'TK', id: 'tk', label: 'TKBAAZI', logo: 'tk.png' },
  { code: 'BP', id: 'bp', label: 'BANGLAPLUS', logo: 'b5.png' },
  { code: 'JW', id: 'jw', label: 'JOYWIN', logo: 'jw.png' },
  { code: 'NCVIP', id: 'ncvip', label: 'NEW CITY VIP', logo: 'ncvip.png' },
  { code: 'M3', id: 'm3', label: 'MNLBET', logo: 'm3.png' },
  { code: 'C1', id: 'c1', label: 'CF789', logo: 'c1.png' },
] as const

export const BRAND_ORDER = BRAND_DEFINITIONS.map((b) => b.id)

const byCode = new Map(
  BRAND_DEFINITIONS.map((b) => [b.code.toUpperCase(), b]),
)
const byId = new Map(BRAND_DEFINITIONS.map((b) => [b.id, b]))

export function isAllowedBrandSheet(sheetName: string): boolean {
  return byCode.has(sheetName.trim().toUpperCase())
}

export function brandFromSheetName(
  sheetName: string,
): BrandDefinition | null {
  return byCode.get(sheetName.trim().toUpperCase()) ?? null
}

export function getBrandDefinition(id: string): BrandDefinition | null {
  return byId.get(id) ?? null
}

export function brandLogoUrl(id: string): string | null {
  const logo = getBrandDefinition(id)?.logo
  if (!logo) return null
  return `/brands/${logo}`
}

export function sortBrandIds(ids: string[]): string[] {
  const rank = new Map(BRAND_ORDER.map((id, i) => [id, i]))
  return ids.slice().sort((a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return a.localeCompare(b)
  })
}
