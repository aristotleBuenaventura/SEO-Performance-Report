export type UserRole = 'superadmin' | 'admin'

export interface WorkerSession {
  /** Empty string = same-origin (Vite proxy / co-hosted). */
  workerUrl: string
  email?: string
  role?: UserRole
}

export interface ManagedUser {
  email: string
  role: UserRole
  totpEnabled: boolean
  createdAt: string
  updatedAt: string
  online?: boolean
  lastSeenAt?: string | null
  lastSeenIp?: string | null
}

export interface LoginResult {
  requires2fa: boolean
  requires2faSetup?: boolean
  challengeToken?: string
  totpEnabled?: boolean
  email?: string
}

export interface AuditEvent {
  id: string
  at: string
  action: string
  ip: string
  userAgent: string
  detail?: string
  actor?: string
  changes?: string[]
}

export interface ReportExtractMeta {
  hasExtract: boolean
  source?: string | null
  uploadedAt?: string | null
  uploadedBy?: string | null
  brandCount?: number
  monthCount?: number
}

const jsonHeaders: HeadersInit = {
  'Content-Type': 'application/json',
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  return `${base.replace(/\/+$/, '')}${path}`
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // ignore
  }
  return `Request failed (HTTP ${response.status})`
}

async function apiFetch(
  workerUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(joinUrl(workerUrl, path), {
    ...init,
    credentials: 'include',
    headers: {
      ...jsonHeaders,
      ...(init.headers || {}),
    },
  })
}

export async function loginWithCredentials(
  workerUrl: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  const response = await apiFetch(workerUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as {
    requires2fa?: boolean
    requires2faSetup?: boolean
    challengeToken?: string
    totpEnabled?: boolean
    email?: string
  }
  return {
    requires2fa: Boolean(body.requires2fa),
    requires2faSetup: Boolean(body.requires2faSetup),
    challengeToken: body.challengeToken,
    totpEnabled: body.totpEnabled,
    email: body.email,
  }
}

export async function verify2fa(
  workerUrl: string,
  challengeToken: string,
  code: string,
): Promise<LoginResult> {
  const response = await apiFetch(workerUrl, '/api/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as {
    totpEnabled?: boolean
    email?: string
    requires2faSetup?: boolean
  }
  return {
    requires2fa: false,
    totpEnabled: Boolean(body.totpEnabled),
    requires2faSetup: Boolean(body.requires2faSetup),
    email: body.email,
  }
}

export async function logoutWorker(session: WorkerSession): Promise<void> {
  await apiFetch(session.workerUrl, '/api/auth/logout', { method: 'POST' })
}

export async function heartbeatWorker(session: WorkerSession): Promise<void> {
  const response = await apiFetch(session.workerUrl, '/api/auth/heartbeat', {
    method: 'POST',
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export async function fetchSessionMe(workerUrl: string): Promise<{
  authenticated: boolean
  totpEnabled: boolean
  requires2faSetup: boolean
  email: string
  role: UserRole
} | null> {
  const response = await apiFetch(workerUrl, '/api/auth/me')
  if (response.status === 401) return null
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as {
    authenticated?: boolean
    totpEnabled?: boolean
    requires2faSetup?: boolean
    email?: string
    role?: string
  }
  return {
    authenticated: Boolean(body.authenticated),
    totpEnabled: Boolean(body.totpEnabled),
    requires2faSetup: Boolean(body.requires2faSetup),
    email: body.email || '',
    role: body.role === 'superadmin' ? 'superadmin' : 'admin',
  }
}

export async function listAdminUsers(
  session: WorkerSession,
): Promise<ManagedUser[]> {
  const response = await apiFetch(session.workerUrl, '/api/admin/users')
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { users?: ManagedUser[] }
  return body.users || []
}

export async function createAdminUser(
  session: WorkerSession,
  input: { email: string; password: string },
): Promise<ManagedUser> {
  const response = await apiFetch(session.workerUrl, '/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ ...input, role: 'admin' }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { user: ManagedUser }
  return body.user
}

export async function resetAdminUserPassword(
  session: WorkerSession,
  email: string,
  password: string,
): Promise<ManagedUser> {
  const response = await apiFetch(
    session.workerUrl,
    `/api/admin/users/${encodeURIComponent(email)}/password`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  )
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { user: ManagedUser }
  return body.user
}

export async function deleteAdminUser(
  session: WorkerSession,
  email: string,
): Promise<void> {
  const response = await apiFetch(
    session.workerUrl,
    `/api/admin/users/${encodeURIComponent(email)}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error(await parseError(response))
}

export async function forceLogoutAdminUser(
  session: WorkerSession,
  email: string,
): Promise<{ email: string; revoked: number }> {
  const response = await apiFetch(
    session.workerUrl,
    `/api/admin/users/${encodeURIComponent(email)}/logout`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { email?: string; revoked?: number }
  return {
    email: body.email || email,
    revoked: body.revoked ?? 0,
  }
}

export async function forgotPassword(
  workerUrl: string,
  email: string,
): Promise<{ message: string; retryAfterSeconds: number }> {
  const response = await apiFetch(workerUrl, '/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    message?: string
    retryAfterSeconds?: number
  }
  if (!response.ok) {
    const err = new Error(body.error || `Request failed (HTTP ${response.status})`)
    ;(err as Error & { retryAfterSeconds?: number }).retryAfterSeconds =
      body.retryAfterSeconds
    throw err
  }
  return {
    message:
      body.message ||
      'If an account exists for that email, a password reset link has been sent.',
    retryAfterSeconds: Math.max(1, body.retryAfterSeconds ?? 120),
  }
}

export async function resetPassword(
  workerUrl: string,
  token: string,
  password: string,
): Promise<{ message: string }> {
  const response = await apiFetch(workerUrl, '/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { message?: string }
  return {
    message:
      body.message ||
      'Password updated. You can sign in with your new password.',
  }
}

export async function start2faSetup(
  session: WorkerSession,
): Promise<{ secret: string; otpauthUrl: string }> {
  const response = await apiFetch(session.workerUrl, '/api/auth/2fa/setup/start', {
    method: 'POST',
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as { secret: string; otpauthUrl: string }
}

export async function confirm2faSetup(
  session: WorkerSession,
  code: string,
): Promise<void> {
  const response = await apiFetch(
    session.workerUrl,
    '/api/auth/2fa/setup/confirm',
    {
      method: 'POST',
      body: JSON.stringify({ code }),
    },
  )
  if (!response.ok) throw new Error(await parseError(response))
}

export async function fetchAuditLog(
  session: WorkerSession,
): Promise<AuditEvent[]> {
  const response = await apiFetch(session.workerUrl, '/api/audit')
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { events: AuditEvent[] }
  return body.events || []
}

export async function fetchReportExtract(
  session: WorkerSession,
): Promise<unknown | null> {
  const response = await apiFetch(session.workerUrl, '/api/report/extract')
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as { extract?: unknown }
  return body.extract ?? null
}

export async function fetchReportExtractMeta(
  session: WorkerSession,
): Promise<ReportExtractMeta> {
  const response = await apiFetch(session.workerUrl, '/api/report/extract/meta')
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as ReportExtractMeta
}

export async function uploadReportExtract(
  session: WorkerSession,
  extract: unknown,
  source: string,
): Promise<{ brands: number; source: string; uploadedAt: string }> {
  const response = await apiFetch(session.workerUrl, '/api/report/extract', {
    method: 'PUT',
    body: JSON.stringify({ extract, source }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as {
    brands: number
    source: string
    uploadedAt: string
  }
}

export async function deleteReportExtract(
  session: WorkerSession,
  password: string,
): Promise<{ deleted: boolean; message: string }> {
  const response = await apiFetch(session.workerUrl, '/api/report/extract', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const body = (await response.json()) as {
    deleted?: boolean
    message?: string
  }
  return {
    deleted: Boolean(body.deleted),
    message: body.message || 'Uploaded data deleted.',
  }
}

export async function bootstrapUpsertUser(
  workerUrl: string,
  input: {
    email: string
    password: string
    adminSecret: string
    role?: UserRole
  },
): Promise<void> {
  const response = await apiFetch(workerUrl, '/api/auth/upsert-user', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseError(response))
}
