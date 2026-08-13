import type { Env } from './env'
import { appendAudit, readAudit } from './security/audit'
import { clientIp, timingSafeEqual } from './security/crypto'
import {
  assertTrustedOrigin,
  cookieOptions,
  corsHeadersFor,
  isPublicInternet,
  parseAllowedOrigins,
  securityHeaders,
} from './security/headers'
import {
  assertBootstrapRateLimit,
  assertForgotPasswordRateLimit,
  assertLoginRateLimit,
  assertNotLocked,
  assertResetPasswordRateLimit,
  assertViewerRateLimit,
  clearFailedLogins,
  isIpAllowed,
  parseIpAllowlist,
  recordFailedLogin,
} from './security/rateLimit'
import { sendPasswordResetEmail } from './security/email'
import {
  buildResetUrl,
  cooldownRemainingMs,
  createPasswordResetToken,
  consumePasswordResetToken,
  markResetCooldown,
  resetCooldownSeconds,
} from './security/passwordReset'
import {
  buildSessionCookie,
  clearSessionCookie,
  consumeChallenge,
  createChallenge,
  createSession,
  IDLE_TIMEOUT_MS,
  listOnlinePresence,
  loadSession,
  parseCookieValue,
  readCookie,
  revokeSession,
  revokeSessionsForEmail,
  SESSION_TTL_MS,
  signCookieValue,
  touchSession,
  type SessionRecord,
} from './security/session'
import {
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotpCode,
} from './security/totp'
import {
  assertStrongAdminSecret,
  assertStrongPassword,
  bumpSessionVersion,
  countUsers,
  createUser,
  deleteUser,
  ensureUserIndexed,
  getUser,
  isValidEmail,
  listUsers,
  normalizeEmail,
  normalizeRole,
  putUser,
  setUserPassword,
  toPublicUser,
  upsertUserPassword,
  verifyPassword,
  type UserRole,
} from './security/users'

export type { Env }

const LOCKOUT_HINT_MIN = 15
const REPORT_EXTRACT_KEY = 'report_extract'

function signingSecret(env: Env): string {
  // Prefer dedicated session secret; fall back to ADMIN_SECRET for local/dev.
  const dedicated = String(env.SESSION_SIGNING_SECRET || '').trim()
  return dedicated || env.ADMIN_SECRET
}

function bindSessionIp(env: Env): boolean {
  const v = String(env.BIND_SESSION_IP || '').toLowerCase()
  if (v === '0' || v === 'false') return false
  if (v === '1' || v === 'true') return true
  return isPublicInternet(env)
}

function withHeaders(
  request: Request,
  env: Env,
  init: ResponseInit & { headers?: HeadersInit } = {},
): ResponseInit {
  const publicInternet = isPublicInternet(env)
  const cors = corsHeadersFor(
    request,
    parseAllowedOrigins(env.ALLOWED_ORIGINS),
    publicInternet,
  )
  const base = { ...securityHeaders(request, publicInternet), ...cors }
  const extra =
    init.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init.headers as Record<string, string> | undefined) || {}
  return { ...init, headers: { ...base, ...extra } }
}

function json(
  request: Request,
  env: Env,
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data, null, 2), withHeaders(request, env, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  }))
}

function unauthorized(request: Request, env: Env, message?: string): Response {
  return json(
    request,
    env,
    { error: message || 'Unauthorized. Sign in required.' },
    401,
  )
}

function rejectOrigin(request: Request, env: Env): Response | null {
  const check = assertTrustedOrigin(request, env)
  if (check.ok) return null
  return json(request, env, { error: check.error }, check.status)
}

type AuthOk = { ok: true; session: SessionRecord }
type AuthFail = { ok: false; response: Response }

async function requireSession(
  request: Request,
  env: Env,
): Promise<AuthOk | AuthFail> {
  // Login/session are not IP-gated — password + 2FA + rate limits cover multi-device.
  // IP_ALLOWLIST applies only to first-user bootstrap (see upsert-user).

  const raw = readCookie(request)
  if (!raw) {
    return { ok: false, response: unauthorized(request, env) }
  }
  const sessionId = await parseCookieValue(raw, signingSecret(env))
  if (!sessionId) {
    return { ok: false, response: unauthorized(request, env) }
  }
  const session = await loadSession(env.CONFIG, sessionId)
  if (!session) {
    return { ok: false, response: unauthorized(request, env) }
  }
  const user = await getUser(env.CONFIG, session.email)
  const userVersion = user?.passwordVersion ?? 0
  const sessionVersion = session.passwordVersion ?? 0
  if (!user || sessionVersion !== userVersion) {
    await revokeSession(env.CONFIG, session.id)
    await appendAudit(
      env.CONFIG,
      request,
      'logout',
      'password changed / session revoked',
    )
    return {
      ok: false,
      response: unauthorized(
        request,
        env,
        'Session expired after a password change. Sign in again.',
      ),
    }
  }
  if (bindSessionIp(env) && session.ip && session.ip !== 'unknown') {
    const ip = clientIp(request)
    if (ip !== 'unknown' && ip !== session.ip) {
      await revokeSession(env.CONFIG, session.id)
      await appendAudit(env.CONFIG, request, 'logout', 'session ip mismatch')
      return {
        ok: false,
        response: unauthorized(
          request,
          env,
          'Session invalidated due to network change. Sign in again.',
        ),
      }
    }
  }
  if (Date.now() - session.lastSeenAt > IDLE_TIMEOUT_MS) {
    await revokeSession(env.CONFIG, session.id)
    await appendAudit(env.CONFIG, request, 'session_idle_expired', session.id)
    return {
      ok: false,
      response: unauthorized(
        request,
        env,
        'Session expired due to inactivity. Sign in again.',
      ),
    }
  }
  await touchSession(env.CONFIG, session)
  return { ok: true, session }
}

type AuthUserOk = { ok: true; session: SessionRecord; role: UserRole; email: string }

/** Report access — any authenticated user with 2FA completed. */
async function requireReportAccess(
  request: Request,
  env: Env,
): Promise<AuthUserOk | AuthFail> {
  const auth = await requireSession(request, env)
  if (!auth.ok) return auth
  const user = await getUser(env.CONFIG, auth.session.email)
  if (!user?.totpEnabled) {
    return {
      ok: false,
      response: json(
        request,
        env,
        {
          error: '2FA setup required before using SEO Report.',
          requires2faSetup: true,
        },
        403,
      ),
    }
  }
  const role = normalizeRole(user.role)
  return {
    ok: true,
    session: auth.session,
    role,
    email: user.email,
  }
}




async function requireAdmin(
  request: Request,
  env: Env,
): Promise<AuthUserOk | AuthFail> {
  const auth = await requireSession(request, env)
  if (!auth.ok) return auth
  const user = await getUser(env.CONFIG, auth.session.email)
  if (!user?.totpEnabled) {
    return {
      ok: false,
      response: json(
        request,
        env,
        {
          error: '2FA setup required before using the admin dashboard.',
          requires2faSetup: true,
        },
        403,
      ),
    }
  }
  const role = normalizeRole(user.role)
  if (role !== 'superadmin' && role !== 'admin') {
    return {
      ok: false,
      response: json(request, env, { error: 'Admin access required.' }, 403),
    }
  }
  return {
    ok: true,
    session: auth.session,
    role,
    email: user.email,
  }
}

async function requireSuperadmin(
  request: Request,
  env: Env,
): Promise<AuthUserOk | AuthFail> {
  const auth = await requireAdmin(request, env)
  if (!auth.ok) return auth
  if (auth.role !== 'superadmin') {
    return {
      ok: false,
      response: json(request, env, { error: 'Superadmin access required.' }, 403),
    }
  }
  return auth
}

async function issueSessionResponse(
  request: Request,
  env: Env,
  email: string,
  totpEnabled: boolean,
  message?: string,
): Promise<Response> {
  const user = await getUser(env.CONFIG, email)
  const session = await createSession(
    env.CONFIG,
    request,
    email,
    user?.passwordVersion ?? 0,
  )
  const value = await signCookieValue(session.id, signingSecret(env))
  const cookieOpts = cookieOptions(request, env.COOKIE_SAMESITE, isPublicInternet(env))
  return json(
    request,
    env,
    {
      ok: true,
      authenticated: true,
      email,
      totpEnabled,
      requires2faSetup: !totpEnabled,
      message,
    },
    200,
    {
      'Set-Cookie': buildSessionCookie(value, {
        ...cookieOpts,
        maxAgeSec: Math.ceil(SESSION_TTL_MS / 1000),
      }),
    },
  )
}

function adminSecretOk(env: Env, provided: string): boolean {
  return Boolean(env.ADMIN_SECRET) && timingSafeEqual(provided, env.ADMIN_SECRET)
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(
        null,
        withHeaders(request, env, { status: 204 }),
      )
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0)
    if (contentLength > 2_000_000) {
      return json(request, env, { error: 'Request body too large.' }, 413)
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      const originBlock = rejectOrigin(request, env)
      if (
        originBlock &&
        path !== '/' &&
        path !== '/api/health' &&
        !(path === '/api/report/extract' && request.method === 'GET')
      ) {
        return originBlock
      }

      if (path === '/' || path === '/api/health') {
        return json(request, env, {
          ok: true,
          service: 'seo-performance-report',
          auth: 'cookie-session',
        })
      }

      // ——— Auth ———
      // Public self-registration disabled. Use upsert-user (bootstrap / admin).
      if (path === '/api/auth/register' && request.method === 'POST') {
        return json(
          request,
          env,
          { error: 'Public registration is disabled. Ask an admin to create your account.' },
          403,
        )
      }

      // First user: ADMIN_SECRET + IP_ALLOWLIST (when public).
      // Later users: authenticated superadmin session + ADMIN_SECRET (any IP).
      if (path === '/api/auth/upsert-user' && request.method === 'POST') {
        const allowlist = parseIpAllowlist(env.IP_ALLOWLIST)
        const publicInternet = isPublicInternet(env)

        const rate = await assertBootstrapRateLimit(env.CONFIG, request)
        if (!rate.ok) {
          return json(
            request,
            env,
            { error: `Too many admin attempts. Try again in ${rate.retryAfterSec}s.` },
            429,
          )
        }

        const body = (await request.json().catch(() => ({}))) as {
          email?: string
          password?: string
          adminSecret?: string
          role?: string
        }
        const adminSecret = String(body.adminSecret || '')
        if (!adminSecretOk(env, adminSecret)) {
          await appendAudit(env.CONFIG, request, 'login_failed', 'upsert bad admin secret')
          return json(request, env, { error: 'Invalid admin secret.' }, 401)
        }
        if (publicInternet) {
          try {
            assertStrongAdminSecret(env.ADMIN_SECRET)
          } catch (error) {
            return json(
              request,
              env,
              { error: error instanceof Error ? error.message : String(error) },
              503,
            )
          }
        }

        const users = await countUsers(env.CONFIG)
        if (users > 0) {
          const auth = await requireSuperadmin(request, env)
          if (!auth.ok) {
            return json(
              request,
              env,
              {
                error:
                  'Creating or updating users requires a superadmin session (2FA) plus ADMIN_SECRET.',
              },
              401,
            )
          }
        } else if (publicInternet) {
          if (allowlist.length === 0) {
            return json(
              request,
              env,
              {
                error:
                  'Set IP_ALLOWLIST before creating the first user on a public Worker.',
              },
              503,
            )
          }
          if (!isIpAllowed(request, allowlist)) {
            return json(request, env, { error: 'IP not allowed for bootstrap.' }, 403)
          }
        }

        try {
          const requestedRole = body.role
            ? normalizeRole(body.role)
            : users === 0
              ? 'superadmin'
              : undefined
          // First account defaults to superadmin; later upserts keep/set role explicitly.
          const role: UserRole | undefined =
            requestedRole === 'superadmin' || requestedRole === 'admin'
              ? requestedRole
              : undefined
          if (users > 0 && role === 'superadmin') {
            return json(
              request,
              env,
              { error: 'Cannot promote to superadmin via upsert after bootstrap.' },
              400,
            )
          }
          const user = await upsertUserPassword(
            env.CONFIG,
            String(body.email || ''),
            String(body.password || ''),
            role,
          )
          await appendAudit(
            env.CONFIG,
            request,
            'login_success',
            `upsert-user ${user.email} role=${user.role}`,
          )
          return json(request, env, {
            ok: true,
            email: user.email,
            role: user.role,
            totpEnabled: user.totpEnabled,
            requires2faSetup: !user.totpEnabled,
          })
        } catch (error) {
          return json(
            request,
            env,
            { error: error instanceof Error ? error.message : String(error) },
            400,
          )
        }
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        const rate = await assertLoginRateLimit(env.CONFIG, request)
        if (!rate.ok) {
          await appendAudit(env.CONFIG, request, 'login_rate_limited')
          return json(
            request,
            env,
            {
              error: `Too many login attempts. Try again in ${rate.retryAfterSec}s.`,
            },
            429,
          )
        }

        const body = (await request.json().catch(() => ({}))) as {
          email?: string
          password?: string
        }
        const email = normalizeEmail(String(body.email || ''))
        const password = String(body.password || '')

        if (!isValidEmail(email) || !password) {
          return json(
            request,
            env,
            { error: 'Email and password are required.' },
            400,
          )
        }

        const lock = await assertNotLocked(env.CONFIG, email)
        if (!lock.ok) {
          await appendAudit(env.CONFIG, request, 'login_locked', email, {
            actor: email,
          })
          return json(
            request,
            env,
            {
              error: `Account locked after failed attempts. Try again in ${lock.retryAfterSec}s.`,
            },
            423,
          )
        }

        const user = await getUser(env.CONFIG, email)
        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          const state = await recordFailedLogin(env.CONFIG, email)
          await appendAudit(
            env.CONFIG,
            request,
            'login_failed',
            `email=${email} failed=${state.failed}`,
            { actor: email },
          )
          if (state.lockedUntil) {
            return json(
              request,
              env,
              {
                error: `Too many failed logins. Locked for ${LOCKOUT_HINT_MIN} minutes.`,
              },
              423,
            )
          }
          return json(request, env, { error: 'Invalid credentials.' }, 401)
        }

        await clearFailedLogins(env.CONFIG, email)
        await ensureUserIndexed(env.CONFIG, user.email)

        if (user.totpEnabled && user.totpSecret) {
          const challenge = await createChallenge(env.CONFIG, request, user.email)
          await appendAudit(env.CONFIG, request, '2fa_required', user.email, {
            actor: user.email,
          })
          return json(request, env, {
            ok: true,
            requires2fa: true,
            challengeToken: challenge.id,
            email: user.email,
          })
        }

        // New account: session allowed only to finish mandatory 2FA setup.
        await appendAudit(
          env.CONFIG,
          request,
          'login_success',
          `${user.email} needs 2FA setup`,
          { actor: user.email },
        )
        return issueSessionResponse(request, env, user.email, false)
      }

      if (path === '/api/auth/2fa/verify' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as {
          challengeToken?: string
          code?: string
        }
        const challenge = await consumeChallenge(
          env.CONFIG,
          String(body.challengeToken || ''),
          request,
        )
        if (!challenge) {
          return json(
            request,
            env,
            { error: '2FA challenge expired. Sign in again.' },
            401,
          )
        }
        const user = await getUser(env.CONFIG, challenge.email)
        if (!user?.totpEnabled || !user.totpSecret) {
          return json(request, env, { error: '2FA is not enabled.' }, 400)
        }
        const ok = await verifyTotpCode(user.totpSecret, String(body.code || ''))
        if (!ok) {
          await appendAudit(env.CONFIG, request, '2fa_failed', challenge.email, {
            actor: challenge.email,
          })
          await recordFailedLogin(env.CONFIG, challenge.email)
          return json(request, env, { error: 'Invalid authenticator code.' }, 401)
        }
        await clearFailedLogins(env.CONFIG, challenge.email)
        await appendAudit(env.CONFIG, request, '2fa_success', user.email, {
          actor: user.email,
        })
        await appendAudit(
          env.CONFIG,
          request,
          'login_success',
          `${user.email} via 2FA`,
          { actor: user.email },
        )
        return issueSessionResponse(request, env, user.email, true)
      }

      if (path === '/api/auth/logout' && request.method === 'POST') {
        const raw = readCookie(request)
        let logoutEmail: string | undefined
        if (raw) {
          const sessionId = await parseCookieValue(raw, signingSecret(env))
          if (sessionId) {
            const session = await loadSession(env.CONFIG, sessionId)
            logoutEmail = session?.email
            await revokeSession(env.CONFIG, sessionId)
          }
        }
        await appendAudit(env.CONFIG, request, 'logout', logoutEmail, {
          actor: logoutEmail,
        })
        const cookieOpts = cookieOptions(request, env.COOKIE_SAMESITE, isPublicInternet(env))
        return json(
          request,
          env,
          { ok: true },
          200,
          { 'Set-Cookie': clearSessionCookie(cookieOpts) },
        )
      }

      if (path === '/api/auth/forgot-password' && request.method === 'POST') {
        const sentMessage =
          'If an account exists for that email, a password reset link has been sent.'
        const waitMessage =
          'Please wait before requesting another reset link. Check your inbox (and spam) for the previous email.'

        const rate = await assertForgotPasswordRateLimit(env.CONFIG, request)
        if (!rate.ok) {
          return json(
            request,
            env,
            {
              error: `Too many password reset requests. Try again in ${rate.retryAfterSec}s.`,
              retryAfterSeconds: rate.retryAfterSec,
            },
            429,
          )
        }

        const body = (await request.json().catch(() => ({}))) as {
          email?: string
        }
        const email = normalizeEmail(String(body.email || ''))
        if (!email || !isValidEmail(email)) {
          return json(request, env, { error: 'Email is required.' }, 400)
        }

        const cooldownSec = resetCooldownSeconds()
        const remainingMs = await cooldownRemainingMs(env.CONFIG, email)
        if (remainingMs > 0) {
          const retryAfterSeconds = Math.ceil(remainingMs / 1000)
          await appendAudit(
            env.CONFIG,
            request,
            'password_reset_requested',
            `cooldown_${retryAfterSeconds}s ${email}`,
          )
          return json(
            request,
            env,
            { error: waitMessage, retryAfterSeconds },
            429,
          )
        }

        const user = await getUser(env.CONFIG, email)
        if (!user) {
          await markResetCooldown(env.CONFIG, email)
          await appendAudit(
            env.CONFIG,
            request,
            'password_reset_requested',
            `unknown_email ${email}`,
          )
          return json(request, env, {
            ok: true,
            message: sentMessage,
            retryAfterSeconds: cooldownSec,
          })
        }

        const { token } = await createPasswordResetToken(env.CONFIG, user.email)
        const resetUrl = buildResetUrl(env, token)
        let delivery: { sent: boolean; logged: boolean }
        try {
          delivery = await sendPasswordResetEmail(env, {
            to: user.email,
            resetUrl,
          })
        } catch (error) {
          await appendAudit(
            env.CONFIG,
            request,
            'password_reset_requested',
            `${user.email} email_failed ${error instanceof Error ? error.message : String(error)}`,
          )
          return json(
            request,
            env,
            {
              error:
                'Could not send the reset email. Try again later or contact an admin.',
            },
            503,
          )
        }
        if (!delivery.sent) {
          await appendAudit(
            env.CONFIG,
            request,
            'password_reset_requested',
            `${user.email} email_not_configured`,
          )
          return json(
            request,
            env,
            {
              error:
                'Password reset email is not configured on the server. Contact an admin.',
            },
            503,
          )
        }
        await markResetCooldown(env.CONFIG, user.email)
        await appendAudit(
          env.CONFIG,
          request,
          'password_reset_requested',
          `${user.email} email_sent`,
        )
        return json(request, env, {
          ok: true,
          message: sentMessage,
          retryAfterSeconds: cooldownSec,
        })
      }

      if (path === '/api/auth/reset-password' && request.method === 'POST') {
        const rate = await assertResetPasswordRateLimit(env.CONFIG, request)
        if (!rate.ok) {
          return json(
            request,
            env,
            {
              error: `Too many reset attempts. Try again in ${rate.retryAfterSec}s.`,
            },
            429,
          )
        }
        const body = (await request.json().catch(() => ({}))) as {
          token?: string
          password?: string
        }
        const token = String(body.token || '').trim()
        const password = String(body.password || '')
        if (!token) {
          return json(request, env, { error: 'Reset token is required.' }, 400)
        }
        try {
          // Validate strength before consuming the one-time token.
          assertStrongPassword(password)
          const email = await consumePasswordResetToken(env.CONFIG, token)
          if (!email) {
            await appendAudit(
              env.CONFIG,
              request,
              'password_reset_failed',
              'invalid_or_expired_token',
            )
            return json(
              request,
              env,
              {
                error:
                  'This reset link is invalid or has expired. Request a new one.',
              },
              400,
            )
          }
          await setUserPassword(env.CONFIG, email, password)
          await appendAudit(
            env.CONFIG,
            request,
            'password_reset_success',
            email,
          )
          return json(request, env, {
            ok: true,
            message: 'Password updated. You can sign in with your new password.',
          })
        } catch (error) {
          return json(
            request,
            env,
            { error: error instanceof Error ? error.message : String(error) },
            400,
          )
        }
      }

      if (path === '/api/auth/me' && request.method === 'GET') {
        const auth = await requireSession(request, env)
        if (!auth.ok) return auth.response
        const user = await getUser(env.CONFIG, auth.session.email)
        const totpEnabled = Boolean(user?.totpEnabled)
        return json(request, env, {
          ok: true,
          authenticated: true,
          email: auth.session.email,
          role: user ? normalizeRole(user.role) : 'admin',
          totpEnabled,
          requires2faSetup: !totpEnabled,
          session: {
            createdAt: new Date(auth.session.createdAt).toISOString(),
            lastSeenAt: new Date(auth.session.lastSeenAt).toISOString(),
          },
        })
      }

      if (path === '/api/auth/heartbeat' && request.method === 'POST') {
        const auth = await requireSession(request, env)
        if (!auth.ok) return auth.response
        return json(request, env, {
          ok: true,
          email: auth.session.email,
          lastSeenAt: new Date(auth.session.lastSeenAt).toISOString(),
        })
      }

      if (path === '/api/auth/2fa/setup/start' && request.method === 'POST') {
        const auth = await requireSession(request, env)
        if (!auth.ok) return auth.response
        const user = await getUser(env.CONFIG, auth.session.email)
        if (!user) {
          return json(request, env, { error: 'User not found.' }, 404)
        }
        if (user.totpEnabled) {
          return json(request, env, { error: '2FA is already enabled.' }, 400)
        }
        const secret = generateTotpSecret()
        await putUser(env.CONFIG, {
          ...user,
          pendingTotpSecret: secret,
          updatedAt: new Date().toISOString(),
        })
        await appendAudit(env.CONFIG, request, '2fa_setup_started', user.email)
        return json(request, env, {
          ok: true,
          secret,
          otpauthUrl: buildOtpauthUrl({ secret, label: user.email }),
        })
      }

      if (path === '/api/auth/2fa/setup/confirm' && request.method === 'POST') {
        const auth = await requireSession(request, env)
        if (!auth.ok) return auth.response
        const body = (await request.json().catch(() => ({}))) as {
          code?: string
        }
        const user = await getUser(env.CONFIG, auth.session.email)
        if (!user?.pendingTotpSecret) {
          return json(
            request,
            env,
            { error: 'No pending 2FA setup. Start setup again.' },
            400,
          )
        }
        const ok = await verifyTotpCode(
          user.pendingTotpSecret,
          String(body.code || ''),
        )
        if (!ok) {
          return json(request, env, { error: 'Invalid authenticator code.' }, 400)
        }
        await putUser(env.CONFIG, {
          ...user,
          totpEnabled: true,
          totpSecret: user.pendingTotpSecret,
          pendingTotpSecret: null,
          updatedAt: new Date().toISOString(),
        })
        await appendAudit(env.CONFIG, request, '2fa_enabled', user.email)
        return json(request, env, {
          ok: true,
          totpEnabled: true,
          requires2faSetup: false,
        })
      }

      // 2FA cannot be fully turned off for accounts (mandatory). Recovery reset requires ADMIN_SECRET.
      if (path === '/api/auth/2fa/reset' && request.method === 'POST') {
        const auth = await requireSession(request, env)
        if (!auth.ok) return auth.response
        const body = (await request.json().catch(() => ({}))) as {
          adminSecret?: string
          code?: string
        }
        if (!adminSecretOk(env, String(body.adminSecret || ''))) {
          return json(request, env, { error: 'Invalid admin secret.' }, 401)
        }
        const user = await getUser(env.CONFIG, auth.session.email)
        if (!user) {
          return json(request, env, { error: 'User not found.' }, 404)
        }
        if (user.totpEnabled && user.totpSecret) {
          const ok = await verifyTotpCode(user.totpSecret, String(body.code || ''))
          if (!ok) {
            return json(
              request,
              env,
              { error: 'Invalid authenticator code.' },
              401,
            )
          }
        }
        await putUser(env.CONFIG, {
          ...user,
          totpEnabled: false,
          totpSecret: null,
          pendingTotpSecret: null,
          updatedAt: new Date().toISOString(),
        })
        await appendAudit(env.CONFIG, request, '2fa_disabled', user.email)
        return json(request, env, {
          ok: true,
          totpEnabled: false,
          requires2faSetup: true,
        })
      }


      // ——— Admin user management (admin + superadmin) ———
      if (path === '/api/admin/users' && request.method === 'GET') {
        const auth = await requireAdmin(request, env)
        if (!auth.ok) return auth.response
        const [users, presence] = await Promise.all([
          listUsers(env.CONFIG),
          listOnlinePresence(env.CONFIG),
        ])
        const onlineByEmail = new Map(
          presence.map((p) => [p.email.trim().toLowerCase(), p]),
        )
        const enriched = users.map((user) => {
          const online = onlineByEmail.get(user.email.trim().toLowerCase())
          return {
            ...user,
            online: Boolean(online),
            lastSeenAt: online
              ? new Date(online.lastSeenAt).toISOString()
              : null,
            lastSeenIp: online?.ip || null,
          }
        })
        return json(request, env, {
          ok: true,
          users: enriched,
          onlineCount: presence.length,
        })
      }

      if (path === '/api/admin/users' && request.method === 'POST') {
        // Admin + superadmin: create operator (admin) accounts from the dashboard.
        const auth = await requireAdmin(request, env)
        if (!auth.ok) return auth.response
        const body = (await request.json().catch(() => ({}))) as {
          email?: string
          password?: string
          role?: string
        }
        // Ignore any client-supplied role — dashboard can only create admin users.
        if (normalizeRole(body.role || 'admin') === 'superadmin') {
          return json(
            request,
            env,
            { error: 'Cannot create another superadmin from the dashboard.' },
            400,
          )
        }
        try {
          const user = await createUser(
            env.CONFIG,
            String(body.email || ''),
            String(body.password || ''),
            'admin',
          )
          await appendAudit(
            env.CONFIG,
            request,
            'login_success',
            `admin-created ${user.email} by ${auth.email}`,
          )
          return json(request, env, { ok: true, user: toPublicUser(user) })
        } catch (error) {
          return json(
            request,
            env,
            { error: error instanceof Error ? error.message : String(error) },
            400,
          )
        }
      }

      {
        const passMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/password$/)
        if (passMatch && request.method === 'POST') {
          const auth = await requireAdmin(request, env)
          if (!auth.ok) return auth.response
          const targetEmail = normalizeEmail(decodeURIComponent(passMatch[1]!))
          const target = await getUser(env.CONFIG, targetEmail)
          if (!target) {
            return json(request, env, { error: 'User not found.' }, 404)
          }
          if (
            target.role === 'superadmin' &&
            target.email !== auth.email
          ) {
            return json(
              request,
              env,
              { error: 'Cannot change another superadmin password.' },
              403,
            )
          }
          const body = (await request.json().catch(() => ({}))) as {
            password?: string
          }
          try {
            const user = await setUserPassword(
              env.CONFIG,
              targetEmail,
              String(body.password || ''),
            )
            await revokeSessionsForEmail(env.CONFIG, targetEmail)
            await appendAudit(
              env.CONFIG,
              request,
              'config_saved',
              `password-reset ${user.email} by ${auth.email}`,
              { actor: auth.email },
            )
            return json(request, env, { ok: true, user: toPublicUser(user) })
          } catch (error) {
            return json(
              request,
              env,
              { error: error instanceof Error ? error.message : String(error) },
              400,
            )
          }
        }
      }

      {
        const logoutMatch = path.match(
          /^\/api\/admin\/users\/([^/]+)\/logout$/,
        )
        if (logoutMatch && request.method === 'POST') {
          const auth = await requireAdmin(request, env)
          if (!auth.ok) return auth.response
          const targetEmail = normalizeEmail(
            decodeURIComponent(logoutMatch[1]!),
          )
          if (targetEmail === auth.email) {
            return json(
              request,
              env,
              { error: 'Use Sign out for your own session.' },
              400,
            )
          }
          const target = await getUser(env.CONFIG, targetEmail)
          if (!target) {
            return json(request, env, { error: 'User not found.' }, 404)
          }
          if (normalizeRole(target.role) === 'superadmin') {
            return json(
              request,
              env,
              { error: 'Cannot force-logout another superadmin.' },
              403,
            )
          }
          await bumpSessionVersion(env.CONFIG, targetEmail)
          const revoked = await revokeSessionsForEmail(env.CONFIG, targetEmail)
          await appendAudit(
            env.CONFIG,
            request,
            'session_force_logout',
            `force-logout ${targetEmail} sessions=${revoked} by ${auth.email}`,
            { actor: auth.email },
          )
          return json(request, env, {
            ok: true,
            email: targetEmail,
            revoked,
          })
        }
      }

      {
        const delMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/)
        if (delMatch && request.method === 'DELETE') {
          const auth = await requireAdmin(request, env)
          if (!auth.ok) return auth.response
          const targetEmail = normalizeEmail(decodeURIComponent(delMatch[1]!))
          if (targetEmail === auth.email) {
            return json(request, env, { error: 'Cannot delete your own account.' }, 400)
          }
          try {
            await revokeSessionsForEmail(env.CONFIG, targetEmail)
            await deleteUser(env.CONFIG, targetEmail)
            await appendAudit(
              env.CONFIG,
              request,
              'logout',
              `deleted-user ${targetEmail} by ${auth.email}`,
              { actor: auth.email },
            )
            return json(request, env, { ok: true })
          } catch (error) {
            return json(
              request,
              env,
              { error: error instanceof Error ? error.message : String(error) },
              400,
            )
          }
        }
      }

      if (path === '/api/audit' && request.method === 'GET') {
        const auth = await requireAdmin(request, env)
        if (!auth.ok) return auth.response
        const events = await readAudit(env.CONFIG, 200)
        return json(request, env, { ok: true, events })
      }


      // ——— Report data (Excel extract) ———
      if (path === '/api/report/extract' && request.method === 'GET') {
        // Public — performance dashboard does not require login.
        const rate = await assertViewerRateLimit(env.CONFIG, request)
        if (!rate.ok) {
          return json(
            request,
            env,
            {
              error: `Too many requests. Try again in ${rate.retryAfterSec}s.`,
            },
            429,
          )
        }
        const raw = await env.CONFIG.get(REPORT_EXTRACT_KEY)
        if (!raw) {
          return json(request, env, { ok: true, extract: null }, 200, {
            'Cache-Control': 'public, max-age=30',
          })
        }
        try {
          return json(
            request,
            env,
            {
              ok: true,
              extract: JSON.parse(raw),
            },
            200,
            { 'Cache-Control': 'public, max-age=30' },
          )
        } catch {
          return json(request, env, { error: 'Stored extract is corrupt.' }, 500)
        }
      }

      if (path === '/api/report/extract' && request.method === 'PUT') {
        const auth = await requireAdmin(request, env)
        if (!auth.ok) return auth.response
        const body = (await request.json().catch(() => null)) as {
          extract?: unknown
          source?: string
        } | null
        if (!body?.extract || typeof body.extract !== 'object') {
          return json(request, env, { error: 'extract object is required.' }, 400)
        }
        const extract = body.extract as Record<string, unknown>
        if (!extract.data || !extract.tabOrder || !extract.brands) {
          return json(
            request,
            env,
            { error: 'Invalid extract: need data, tabOrder, and brands.' },
            400,
          )
        }
        const payload = {
          ...extract,
          uploadedAt: new Date().toISOString(),
          uploadedBy: auth.email,
          source: body.source || extract.source || 'uploaded.xlsx',
        }
        const serialized = JSON.stringify(payload)
        if (serialized.length > 1_500_000) {
          return json(
            request,
            env,
            { error: 'Extract payload too large to store.' },
            413,
          )
        }
        await env.CONFIG.put(REPORT_EXTRACT_KEY, serialized)
        await appendAudit(
          env.CONFIG,
          request,
          'report_upload',
          `Uploaded ${payload.source}`,
          {
            actor: auth.email,
            changes: [
              `File: ${payload.source}`,
              `Brands: ${Array.isArray(extract.tabOrder) ? extract.tabOrder.length : 0}`,
            ],
          },
        )
        const brands = Array.isArray(extract.tabOrder) ? extract.tabOrder.length : 0
        return json(request, env, {
          ok: true,
          brands,
          source: payload.source,
          uploadedAt: payload.uploadedAt,
        })
      }

      if (path === '/api/report/extract' && request.method === 'DELETE') {
        const auth = await requireAdmin(request, env)
        if (!auth.ok) return auth.response
        const body = (await request.json().catch(() => ({}))) as {
          password?: string
        }
        const password = String(body.password || '')
        if (!password) {
          return json(request, env, { error: 'Admin password is required.' }, 400)
        }
        const user = await getUser(env.CONFIG, auth.email)
        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          await appendAudit(
            env.CONFIG,
            request,
            'login_failed',
            `report-extract-delete bad password by ${auth.email}`,
            { actor: auth.email },
          )
          return json(request, env, { error: 'Incorrect admin password.' }, 401)
        }
        const existing = await env.CONFIG.get(REPORT_EXTRACT_KEY)
        if (!existing) {
          return json(request, env, {
            ok: true,
            deleted: false,
            message: 'No uploaded file to delete.',
          })
        }
        await env.CONFIG.delete(REPORT_EXTRACT_KEY)
        await appendAudit(
          env.CONFIG,
          request,
          'report_delete',
          `Deleted uploaded Excel data`,
          { actor: auth.email },
        )
        return json(request, env, {
          ok: true,
          deleted: true,
          message: 'Uploaded Excel data deleted. Report dashboard is now empty.',
        })
      }

      if (path === '/api/report/extract/meta' && request.method === 'GET') {
        const auth = await requireAdmin(request, env)
        if (!auth.ok) return auth.response
        const raw = await env.CONFIG.get(REPORT_EXTRACT_KEY)
        if (!raw) {
          return json(request, env, { ok: true, hasExtract: false })
        }
        try {
          const parsed = JSON.parse(raw) as {
            source?: string
            uploadedAt?: string
            uploadedBy?: string
            tabOrder?: string[]
            months?: string[]
          }
          return json(request, env, {
            ok: true,
            hasExtract: true,
            source: parsed.source || null,
            uploadedAt: parsed.uploadedAt || null,
            uploadedBy: parsed.uploadedBy || null,
            brandCount: parsed.tabOrder?.length ?? 0,
            monthCount: parsed.months?.length ?? 0,
          })
        } catch {
          return json(request, env, { ok: true, hasExtract: false })
        }
      }

      return json(request, env, { error: 'Not found' }, 404)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return json(request, env, { error: message }, 500)
    }
  },
}
