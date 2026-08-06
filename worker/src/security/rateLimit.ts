import { clientIp } from './crypto'
import { normalizeEmail } from './users'

const RATE_KEY_PREFIX = 'auth_rate:'
const BOOTSTRAP_RATE_PREFIX = 'auth_bootstrap:'
const LOCK_KEY_PREFIX = 'auth_lockout:'

export const MAX_FAILED_LOGINS = 5
export const LOCKOUT_MS = 15 * 60 * 1000
export const RATE_WINDOW_MS = 15 * 60 * 1000
export const RATE_MAX = 10
export const BOOTSTRAP_RATE_MAX = 5
export const BOOTSTRAP_WINDOW_MS = 60 * 60 * 1000

interface LockState {
  failed: number
  lockedUntil: number | null
}

interface RateState {
  count: number
  windowStart: number
}

function lockKey(email: string): string {
  return `${LOCK_KEY_PREFIX}${normalizeEmail(email)}`
}

export async function getLockState(
  kv: KVNamespace,
  email: string,
): Promise<LockState> {
  const key = lockKey(email)
  const raw = await kv.get(key)
  if (!raw) return { failed: 0, lockedUntil: null }
  try {
    return JSON.parse(raw) as LockState
  } catch {
    return { failed: 0, lockedUntil: null }
  }
}

export async function assertNotLocked(
  kv: KVNamespace,
  email: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const key = lockKey(email)
  const state = await getLockState(kv, email)
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((state.lockedUntil - Date.now()) / 1000),
    }
  }
  if (state.lockedUntil && state.lockedUntil <= Date.now()) {
    await kv.put(key, JSON.stringify({ failed: 0, lockedUntil: null }))
  }
  return { ok: true }
}

export async function recordFailedLogin(
  kv: KVNamespace,
  email: string,
): Promise<LockState> {
  const key = lockKey(email)
  const state = await getLockState(kv, email)
  const failed = state.failed + 1
  const lockedUntil =
    failed >= MAX_FAILED_LOGINS ? Date.now() + LOCKOUT_MS : null
  const next: LockState = { failed, lockedUntil }
  await kv.put(key, JSON.stringify(next), {
    expirationTtl: Math.ceil(LOCKOUT_MS / 1000) + 60,
  })
  return next
}

export async function clearFailedLogins(
  kv: KVNamespace,
  email: string,
): Promise<void> {
  await kv.put(lockKey(email), JSON.stringify({ failed: 0, lockedUntil: null }))
}

async function bumpRate(
  kv: KVNamespace,
  key: string,
  windowMs: number,
  max: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now()
  const raw = await kv.get(key)
  let state: RateState = { count: 0, windowStart: now }
  if (raw) {
    try {
      state = JSON.parse(raw) as RateState
    } catch {
      /* ignore */
    }
  }
  if (now - state.windowStart > windowMs) {
    state = { count: 0, windowStart: now }
  }
  state.count += 1
  const ttlSec = Math.ceil(windowMs / 1000)
  await kv.put(key, JSON.stringify(state), { expirationTtl: ttlSec })
  if (state.count > max) {
    const retryAfterSec = Math.ceil((state.windowStart + windowMs - now) / 1000)
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) }
  }
  return { ok: true }
}

export async function assertLoginRateLimit(
  kv: KVNamespace,
  request: Request,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const ip = clientIp(request)
  return bumpRate(kv, `${RATE_KEY_PREFIX}${ip}`, RATE_WINDOW_MS, RATE_MAX)
}

export async function assertBootstrapRateLimit(
  kv: KVNamespace,
  request: Request,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const ip = clientIp(request)
  return bumpRate(
    kv,
    `${BOOTSTRAP_RATE_PREFIX}${ip}`,
    BOOTSTRAP_WINDOW_MS,
    BOOTSTRAP_RATE_MAX,
  )
}

export async function assertForgotPasswordRateLimit(
  kv: KVNamespace,
  request: Request,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const ip = clientIp(request)
  return bumpRate(kv, `auth_forgot:${ip}`, RATE_WINDOW_MS, 5)
}

export async function assertResetPasswordRateLimit(
  kv: KVNamespace,
  request: Request,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const ip = clientIp(request)
  return bumpRate(kv, `auth_reset:${ip}`, RATE_WINDOW_MS, 10)
}

/** Public report extract — limit scraping. */
export async function assertViewerRateLimit(
  kv: KVNamespace,
  request: Request,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const ip = clientIp(request)
  return bumpRate(kv, `viewer_rate:${ip}`, 60_000, 30)
}

export function parseIpAllowlist(raw: string | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isIpAllowed(request: Request, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true
  const ip = clientIp(request)
  return allowlist.includes(ip)
}
