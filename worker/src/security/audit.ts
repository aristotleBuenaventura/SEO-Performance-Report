import type { AppConfig } from '../types'
import { clientIp, clientUserAgent, randomId } from './crypto'

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'login_locked'
  | 'login_rate_limited'
  | 'login_ip_blocked'
  | '2fa_required'
  | '2fa_success'
  | '2fa_failed'
  | '2fa_setup_started'
  | '2fa_enabled'
  | '2fa_disabled'
  | 'logout'
  | 'session_idle_expired'
  | 'session_force_logout'
  | 'apply_run'
  | 'config_saved'
  | 'password_reset_requested'
  | 'password_reset_failed'
  | 'password_reset_success'

export interface AuditEvent {
  id: string
  at: string
  action: AuditAction
  ip: string
  userAgent: string
  detail?: string
  /** Email of the user who performed the action, when known. */
  actor?: string
  /** Human-readable change lines (settings diffs). */
  changes?: string[]
}

const AUDIT_KEY = 'security_audit'
const MAX_EVENTS = 250

export async function appendAudit(
  kv: KVNamespace,
  request: Request,
  action: AuditAction,
  detail?: string,
  meta?: { actor?: string; changes?: string[] },
): Promise<void> {
  const actor = meta?.actor?.trim().toLowerCase() || undefined
  const changes = meta?.changes
    ?.map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 40)
    .map((c) => c.slice(0, 300))

  const event: AuditEvent = {
    id: randomId(8),
    at: new Date().toISOString(),
    action,
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    detail: detail?.slice(0, 1500),
    actor,
    changes: changes && changes.length > 0 ? changes : undefined,
  }

  const raw = await kv.get(AUDIT_KEY)
  let list: AuditEvent[] = []
  if (raw) {
    try {
      list = JSON.parse(raw) as AuditEvent[]
    } catch {
      list = []
    }
  }
  list.unshift(event)
  if (list.length > MAX_EVENTS) list = list.slice(0, MAX_EVENTS)
  await kv.put(AUDIT_KEY, JSON.stringify(list))
}

export async function readAudit(
  kv: KVNamespace,
  limit = 50,
): Promise<AuditEvent[]> {
  const raw = await kv.get(AUDIT_KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as AuditEvent[]
    return list.slice(0, limit)
  } catch {
    return []
  }
}

function domainSet(domains: string[]): Set<string> {
  return new Set(
    domains.map((d) => d.trim().toLowerCase()).filter(Boolean),
  )
}

/** Build readable lines for schedule / time / CSV / wildcard diffs. */
export function describeConfigChanges(
  prev: AppConfig,
  next: AppConfig,
): string[] {
  const changes: string[] = []

  const prevByKey = new Map(prev.schedule.map((d) => [d.key, d]))
  for (const day of next.schedule) {
    const old = prevByKey.get(day.key)
    const oldUrl = (old?.targetUrl || '').trim()
    const newUrl = (day.targetUrl || '').trim()
    if (oldUrl !== newUrl) {
      const label = day.label || day.key
      changes.push(
        `${label}: ${oldUrl || '(empty)'} → ${newUrl || '(empty)'}`,
      )
    }
  }

  if (prev.applyTime !== next.applyTime) {
    changes.push(`Apply time: ${prev.applyTime} → ${next.applyTime}`)
  }

  if ((prev.timezone || '') !== (next.timezone || '')) {
    changes.push(`Timezone: ${prev.timezone} → ${next.timezone}`)
  }

  if (prev.wildcard !== next.wildcard) {
    changes.push(
      `Wildcard: ${prev.wildcard ? 'on' : 'off'} → ${next.wildcard ? 'on' : 'off'}`,
    )
  }

  const before = domainSet(prev.domains)
  const after = domainSet(next.domains)
  const sameDomains =
    before.size === after.size && [...before].every((d) => after.has(d))
  if (!sameDomains) {
    let added = 0
    let removed = 0
    for (const d of after) if (!before.has(d)) added += 1
    for (const d of before) if (!after.has(d)) removed += 1
    changes.push(
      `Account 1 domains: ${prev.domains.length} → ${next.domains.length} (+${added} / −${removed})`,
    )
  }

  const before2 = domainSet(prev.domains2 || [])
  const after2 = domainSet(next.domains2 || [])
  const sameDomains2 =
    before2.size === after2.size && [...before2].every((d) => after2.has(d))
  if (!sameDomains2) {
    let added = 0
    let removed = 0
    for (const d of after2) if (!before2.has(d)) added += 1
    for (const d of before2) if (!after2.has(d)) removed += 1
    changes.push(
      `Account 2 domains: ${(prev.domains2 || []).length} → ${(next.domains2 || []).length} (+${added} / −${removed})`,
    )
  }

  return changes
}
