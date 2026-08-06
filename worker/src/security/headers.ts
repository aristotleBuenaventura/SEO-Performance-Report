import type { Env } from '../env'

export function securityHeaders(
  request: Request,
  publicInternet: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': publicInternet
      ? 'cross-origin'
      : 'same-site',
    'Content-Security-Policy':
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cache-Control': 'no-store',
  }
  if (new URL(request.url).protocol === 'https:') {
    headers['Strict-Transport-Security'] =
      'max-age=31536000; includeSubDomains; preload'
  }
  return headers
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isPublicInternet(env: {
  PUBLIC_INTERNET?: string
}): boolean {
  const v = String(env.PUBLIC_INTERNET || '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function corsHeadersFor(
  request: Request,
  allowedOrigins: string[],
  publicInternet: boolean,
): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }

  if (publicInternet) {
    // Fail-closed: never reflect arbitrary Origin
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
    }
    return headers
  }

  // Local/dev: allowlisted if set, otherwise reflect for Vite proxy workflows
  if (allowedOrigins.length > 0) {
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
    }
    return headers
  }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

/**
 * CSRF / cross-site request defense for cookie sessions.
 * - Public mode: Origin must be allowlisted (or same-origin as Worker)
 * - Local/dev (PUBLIC_INTERNET unset): allow Vite proxy origins freely
 */
export function assertTrustedOrigin(
  request: Request,
  env: Pick<Env, 'ALLOWED_ORIGINS' | 'PUBLIC_INTERNET'>,
): { ok: true } | { ok: false; error: string; status: number } {
  const publicInternet = isPublicInternet(env)
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer')

  // Local / private Worker: do not block Vite (localhost → 8787) traffic.
  if (!publicInternet) {
    return { ok: true }
  }

  if (allowed.length === 0) {
    return {
      ok: false,
      status: 503,
      error:
        'Server misconfigured: set ALLOWED_ORIGINS when PUBLIC_INTERNET=true.',
    }
  }

  // Resolve caller origin
  let caller: string | null = origin
  if (!caller && referer) {
    try {
      caller = new URL(referer).origin
    } catch {
      caller = null
    }
  }

  if (caller) {
    if (caller === url.origin) return { ok: true }
    if (allowed.includes(caller)) return { ok: true }
    return {
      ok: false,
      status: 403,
      error: 'Origin not allowed.',
    }
  }

  // No Origin/Referer (curl / server tools) — IP allowlist enforced elsewhere.
  return { ok: true }
}

export function cookieOptions(
  request: Request,
  envSameSite?: string,
  publicInternet?: boolean,
): {
  secure: boolean
  sameSite: 'Lax' | 'None' | 'Strict'
} {
  const url = new URL(request.url)
  const isHttps = url.protocol === 'https:'
  const raw = (envSameSite || '').toLowerCase()
  let sameSite: 'Lax' | 'None' | 'Strict' = publicInternet ? 'None' : 'Lax'
  if (raw === 'none' || raw === 'strict' || raw === 'lax') {
    sameSite = (raw.charAt(0).toUpperCase() + raw.slice(1)) as
      | 'Lax'
      | 'None'
      | 'Strict'
  } else if (isHttps && request.headers.get('Origin')) {
    const origin = request.headers.get('Origin') || ''
    if (origin && origin !== url.origin) sameSite = 'None'
  }
  // Public cross-origin UI needs Secure + SameSite=None
  if (publicInternet && sameSite !== 'Strict') {
    sameSite = envSameSite?.toLowerCase() === 'strict' ? 'Strict' : 'None'
  }
  const secure = isHttps || sameSite === 'None' || Boolean(publicInternet)
  return { secure, sameSite }
}
