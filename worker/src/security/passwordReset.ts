import { randomId, sha256Hex } from './crypto'
import { normalizeEmail } from './users'

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour
export const PASSWORD_RESET_COOLDOWN_MS = 2 * 60 * 1000 // 2 minutes
export const FORGOT_PASSWORD_RATE_MAX = 5

export interface PasswordResetRecord {
  email: string
  tokenHash: string
  createdAt: number
  expiresAt: number
  usedAt: number | null
}

function resetKey(tokenHash: string): string {
  return `pwreset:${tokenHash}`
}

function cooldownKey(email: string): string {
  return `pwreset_cd:${normalizeEmail(email)}`
}

function activeResetKey(email: string): string {
  return `pwreset_active:${normalizeEmail(email)}`
}

export function appPublicUrl(env: {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}): string {
  const fromEnv = env.APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const firstOrigin = env.ALLOWED_ORIGINS?.split(',')[0]?.trim()
  if (firstOrigin) return firstOrigin.replace(/\/+$/, '')
  return 'http://localhost:5173'
}

export function buildResetUrl(
  env: { APP_URL?: string; ALLOWED_ORIGINS?: string },
  token: string,
): string {
  return `${appPublicUrl(env)}/login?resetToken=${encodeURIComponent(token)}`
}

export function resetCooldownSeconds(): number {
  return Math.ceil(PASSWORD_RESET_COOLDOWN_MS / 1000)
}

export async function cooldownRemainingMs(
  kv: KVNamespace,
  email: string,
): Promise<number> {
  const raw = await kv.get(cooldownKey(email))
  if (!raw) return 0
  const until = Number(raw)
  if (!Number.isFinite(until)) return 0
  return Math.max(0, until - Date.now())
}

export async function markResetCooldown(
  kv: KVNamespace,
  email: string,
): Promise<void> {
  const until = Date.now() + PASSWORD_RESET_COOLDOWN_MS
  await kv.put(cooldownKey(email), String(until), {
    expirationTtl: Math.ceil(PASSWORD_RESET_COOLDOWN_MS / 1000) + 5,
  })
}

export async function createPasswordResetToken(
  kv: KVNamespace,
  email: string,
): Promise<{ token: string; expiresAt: number }> {
  const normalized = normalizeEmail(email)
  // Invalidate any previous unused reset token for this email.
  const prevHash = await kv.get(activeResetKey(normalized))
  if (prevHash) {
    await kv.delete(resetKey(prevHash))
    await kv.delete(activeResetKey(normalized))
  }

  const token = randomId(32)
  const tokenHash = await sha256Hex(token)
  const now = Date.now()
  const record: PasswordResetRecord = {
    email: normalized,
    tokenHash,
    createdAt: now,
    expiresAt: now + RESET_TOKEN_TTL_MS,
    usedAt: null,
  }
  const ttl = Math.ceil(RESET_TOKEN_TTL_MS / 1000)
  await kv.put(resetKey(tokenHash), JSON.stringify(record), {
    expirationTtl: ttl,
  })
  await kv.put(activeResetKey(normalized), tokenHash, { expirationTtl: ttl })
  return { token, expiresAt: record.expiresAt }
}

export async function consumePasswordResetToken(
  kv: KVNamespace,
  token: string,
): Promise<string | null> {
  const tokenHash = await sha256Hex(token.trim())
  const key = resetKey(tokenHash)
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    const record = JSON.parse(raw) as PasswordResetRecord
    if (record.usedAt) return null
    if (record.expiresAt <= Date.now()) {
      await kv.delete(key)
      await kv.delete(activeResetKey(record.email))
      return null
    }
    record.usedAt = Date.now()
    await kv.put(key, JSON.stringify(record), { expirationTtl: 60 })
    await kv.delete(activeResetKey(record.email))
    return record.email
  } catch {
    return null
  }
}
