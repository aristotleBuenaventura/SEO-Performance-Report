import {
  clientIp,
  clientUserAgent,
  hmacSha256Hex,
  randomId,
  timingSafeEqual,
} from './crypto'

export const COOKIE_NAME = 'seo_report_session'
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
/** How long a user stays "online" after last activity (heartbeat / API). */
export const PRESENCE_TTL_SEC = 90

export interface SessionRecord {
  id: string
  email: string
  createdAt: number
  lastSeenAt: number
  ip: string
  userAgent: string
  /** Matches UserRecord.passwordVersion at session create time. */
  passwordVersion: number
}

export interface ChallengeRecord {
  id: string
  email: string
  createdAt: number
  ip: string
}

export interface PresenceRecord {
  email: string
  lastSeenAt: number
  ip: string
}

function sessionKey(id: string) {
  return `session:${id}`
}

function challengeKey(id: string) {
  return `challenge:${id}`
}

function presenceKey(email: string) {
  return `presence:${email.trim().toLowerCase()}`
}

async function bumpPresence(
  kv: KVNamespace,
  email: string,
  ip: string,
  lastSeenAt = Date.now(),
): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  const record: PresenceRecord = {
    email: normalized,
    lastSeenAt,
    ip,
  }
  await kv.put(presenceKey(normalized), JSON.stringify(record), {
    expirationTtl: PRESENCE_TTL_SEC,
  })
}

export async function listOnlinePresence(
  kv: KVNamespace,
): Promise<PresenceRecord[]> {
  const online: PresenceRecord[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({
      prefix: 'presence:',
      cursor,
      limit: 200,
    })
    const values = await Promise.all(
      page.keys.map(async (key) => {
        const raw = await kv.get(key.name)
        if (!raw) return null
        try {
          return JSON.parse(raw) as PresenceRecord
        } catch {
          return null
        }
      }),
    )
    for (const record of values) {
      if (record?.email) online.push(record)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  return online.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export async function createSession(
  kv: KVNamespace,
  request: Request,
  email: string,
  passwordVersion = 0,
): Promise<SessionRecord> {
  const id = randomId(24)
  const now = Date.now()
  const record: SessionRecord = {
    id,
    email,
    createdAt: now,
    lastSeenAt: now,
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    passwordVersion,
  }
  await kv.put(sessionKey(id), JSON.stringify(record), {
    expirationTtl: Math.ceil(SESSION_TTL_MS / 1000),
  })
  await bumpPresence(kv, email, record.ip, now)
  return record
}

export async function revokeSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<void> {
  await kv.delete(sessionKey(sessionId))
}

export async function clearPresence(
  kv: KVNamespace,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  await kv.delete(presenceKey(normalized))
}

/** Revoke every active session for an email and clear online presence. */
export async function revokeSessionsForEmail(
  kv: KVNamespace,
  email: string,
): Promise<number> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return 0

  let revoked = 0
  let cursor: string | undefined
  do {
    const page = await kv.list({
      prefix: 'session:',
      cursor,
      limit: 200,
    })
    const hits = await Promise.all(
      page.keys.map(async (key) => {
        const raw = await kv.get(key.name)
        if (!raw) return 0
        try {
          const record = JSON.parse(raw) as SessionRecord
          if (record.email?.trim().toLowerCase() !== normalized) return 0
          await kv.delete(key.name)
          return 1
        } catch {
          return 0
        }
      }),
    )
    revoked += hits.reduce<number>((sum, n) => sum + n, 0)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  await clearPresence(kv, normalized)
  return revoked
}

export async function loadSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<SessionRecord | null> {
  const raw = await kv.get(sessionKey(sessionId))
  if (!raw) return null
  try {
    const record = JSON.parse(raw) as SessionRecord
    return {
      ...record,
      passwordVersion:
        typeof record.passwordVersion === 'number' ? record.passwordVersion : 0,
    }
  } catch {
    return null
  }
}

export async function touchSession(
  kv: KVNamespace,
  session: SessionRecord,
): Promise<SessionRecord> {
  const next = { ...session, lastSeenAt: Date.now() }
  await Promise.all([
    kv.put(sessionKey(session.id), JSON.stringify(next), {
      expirationTtl: Math.ceil(SESSION_TTL_MS / 1000),
    }),
    bumpPresence(kv, next.email, next.ip, next.lastSeenAt),
  ])
  return next
}

export async function createChallenge(
  kv: KVNamespace,
  request: Request,
  email: string,
): Promise<ChallengeRecord> {
  const id = randomId(24)
  const record: ChallengeRecord = {
    id,
    email,
    createdAt: Date.now(),
    ip: clientIp(request),
  }
  await kv.put(challengeKey(id), JSON.stringify(record), {
    expirationTtl: Math.ceil(CHALLENGE_TTL_MS / 1000),
  })
  return record
}

export async function consumeChallenge(
  kv: KVNamespace,
  challengeId: string,
  request?: Request,
): Promise<ChallengeRecord | null> {
  const raw = await kv.get(challengeKey(challengeId))
  if (!raw) return null
  await kv.delete(challengeKey(challengeId))
  try {
    const record = JSON.parse(raw) as ChallengeRecord
    if (Date.now() - record.createdAt > CHALLENGE_TTL_MS) return null
    if (request) {
      const ip = clientIp(request)
      if (
        record.ip &&
        record.ip !== 'unknown' &&
        ip !== 'unknown' &&
        record.ip !== ip
      ) {
        return null
      }
    }
    return record
  } catch {
    return null
  }
}

export async function signCookieValue(
  sessionId: string,
  secret: string,
): Promise<string> {
  const sig = await hmacSha256Hex(secret, sessionId)
  return `${sessionId}.${sig.slice(0, 32)}`
}

export async function parseCookieValue(
  value: string,
  secret: string,
): Promise<string | null> {
  const [sessionId, sig] = value.split('.')
  if (!sessionId || !sig) return null
  const expected = (await hmacSha256Hex(secret, sessionId)).slice(0, 32)
  if (!timingSafeEqual(sig, expected)) return null
  return sessionId
}

export function readCookie(
  request: Request,
  name = COOKIE_NAME,
): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function buildSessionCookie(
  value: string,
  opts: { secure: boolean; sameSite: 'Lax' | 'None' | 'Strict'; maxAgeSec: number },
): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${opts.sameSite}`,
    `Max-Age=${opts.maxAgeSec}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(opts: {
  secure: boolean
  sameSite: 'Lax' | 'None' | 'Strict'
}): string {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    `SameSite=${opts.sameSite}`,
    'Max-Age=0',
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}
