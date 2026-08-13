import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createAdminUser,
  deleteAdminUser,
  deleteReportExtract,
  fetchAuditLog,
  fetchReportExtractMeta,
  fetchSessionMe,
  forceLogoutAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
  uploadReportExtract,
  type AuditEvent,
  type ManagedUser,
  type ReportExtractMeta,
  type WorkerSession,
} from '../lib/workerApi'
import { parseSeoExcelFile } from '../lib/excelParse'
import { ThemeToggle } from './ThemeToggle'

interface AdminDashboardProps {
  session: WorkerSession
  onLogout: () => void | Promise<void>
  onExtractUploaded?: () => void | Promise<void>
}

function formatWhen(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function roleLabel(role: string) {
  return role === 'superadmin' ? 'Superadmin' : 'Admin'
}

function initials(email: string) {
  const parts = email.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return email.slice(0, 2).toUpperCase() || '?'
}

type AuditTab = 'login' | 'excel'

function isLoginAction(action: string) {
  return (
    action.startsWith('login_') ||
    action.startsWith('2fa_') ||
    action === 'logout' ||
    action === 'session_idle_expired' ||
    action === 'session_force_logout' ||
    action.startsWith('password_reset_')
  )
}

function isExcelAction(action: string, detail?: string) {
  if (action === 'report_upload' || action === 'report_delete') return true
  // Legacy events logged as config_saved before dedicated actions existed
  if (
    action === 'config_saved' &&
    detail &&
    /report-extract-(upload|deleted)/i.test(detail)
  ) {
    return true
  }
  return false
}

function actionLabel(action: string) {
  switch (action) {
    case 'login_success':
      return 'Login success'
    case 'login_failed':
      return 'Login failed'
    case 'login_locked':
      return 'Login locked'
    case 'login_rate_limited':
      return 'Rate limited'
    case 'login_ip_blocked':
      return 'IP blocked'
    case '2fa_required':
      return '2FA required'
    case '2fa_success':
      return '2FA success'
    case '2fa_failed':
      return '2FA failed'
    case '2fa_setup_started':
      return '2FA setup started'
    case '2fa_enabled':
      return '2FA enabled'
    case '2fa_disabled':
      return '2FA disabled'
    case 'logout':
      return 'Logout'
    case 'session_idle_expired':
      return 'Session idle expired'
    case 'session_force_logout':
      return 'Force logout'
    case 'password_reset_requested':
      return 'Password reset requested'
    case 'password_reset_failed':
      return 'Password reset failed'
    case 'password_reset_success':
      return 'Password reset success'
    case 'report_upload':
      return 'Excel uploaded'
    case 'report_delete':
      return 'Excel deleted'
    case 'config_saved':
      return 'Excel updated'
    default:
      return action.replace(/_/g, ' ')
  }
}

function actorFromEvent(ev: AuditEvent): string | null {
  if (ev.actor) return ev.actor
  if (!ev.detail) return null
  const emailMatch = ev.detail.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  )
  return emailMatch?.[1]?.toLowerCase() || null
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M4 19h16" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </svg>
  )
}

function IconSheet() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  )
}

function IconAudit() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  )
}

export function AdminDashboard({
  session,
  onLogout,
  onExtractUploaded,
}: AdminDashboardProps) {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(false)
  const [gateChecking, setGateChecking] = useState(true)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [passwordEmail, setPasswordEmail] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [busyEmail, setBusyEmail] = useState<string | null>(null)
  const [meta, setMeta] = useState<ReportExtractMeta | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditRefreshing, setAuditRefreshing] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditTab, setAuditTab] = useState<AuditTab>('login')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await fetchSessionMe(session.workerUrl)
        if (cancelled) return
        if (!me?.authenticated) {
          setAllowed(false)
          setGateChecking(false)
          navigate('/login', { replace: true })
          return
        }
        setAllowed(true)
      } catch {
        if (!cancelled) {
          setAllowed(false)
          setError('Could not verify admin session.')
        }
      } finally {
        if (!cancelled) setGateChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.workerUrl, navigate])

  const loadUsers = useCallback(async () => {
    try {
      const list = await listAdminUsers(session)
      setUsers(list)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load accounts'
      setError(msg)
      if (/admin access required|superadmin|forbidden|403/i.test(msg)) {
        setAllowed(false)
      }
    } finally {
      setLoading(false)
    }
  }, [session])

  const loadMeta = useCallback(async () => {
    try {
      const next = await fetchReportExtractMeta(session)
      setMeta(next)
    } catch {
      /* ignore */
    }
  }, [session])

  const loadAudit = useCallback(async () => {
    setAuditRefreshing(true)
    try {
      const events = await fetchAuditLog(session)
      setAuditEvents(events)
      setAuditError(null)
    } catch (err) {
      setAuditError(
        err instanceof Error ? err.message : 'Failed to load audit log',
      )
    } finally {
      setAuditLoading(false)
      setAuditRefreshing(false)
    }
  }, [session])

  useEffect(() => {
    if (!allowed) return
    void loadUsers()
    void loadMeta()
    void loadAudit()
  }, [allowed, loadUsers, loadMeta, loadAudit])

  const onlineCount = useMemo(
    () => users.filter((u) => u.online).length,
    [users],
  )

  const filteredAudit = useMemo(() => {
    return auditEvents.filter((ev) => {
      if (auditTab === 'login') return isLoginAction(ev.action)
      return isExcelAction(ev.action, ev.detail)
    })
  }, [auditEvents, auditTab])

  const loginCount = useMemo(
    () => auditEvents.filter((e) => isLoginAction(e.action)).length,
    [auditEvents],
  )
  const excelCount = useMemo(
    () =>
      auditEvents.filter((e) => isExcelAction(e.action, e.detail)).length,
    [auditEvents],
  )

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setNotice(null)
    setError(null)
    try {
      await createAdminUser(session, {
        email: email.trim(),
        password,
      })
      setEmail('')
      setPassword('')
      setNotice('Account created. They must set up 2FA on first login.')
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function handleResetPassword(target: string) {
    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    setBusyEmail(target)
    setError(null)
    try {
      await resetAdminUserPassword(session, target, newPassword)
      setPasswordEmail(null)
      setNewPassword('')
      setNotice(`Password updated for ${target}.`)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setBusyEmail(null)
    }
  }

  async function handleDelete(target: ManagedUser) {
    if (!window.confirm(`Delete account ${target.email}?`)) return
    setBusyEmail(target.email)
    try {
      await deleteAdminUser(session, target.email)
      setNotice(`Deleted ${target.email}.`)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyEmail(null)
    }
  }

  async function handleForceLogout(target: ManagedUser) {
    setBusyEmail(target.email)
    try {
      const result = await forceLogoutAdminUser(session, target.email)
      setNotice(`Forced logout for ${result.email} (${result.revoked} sessions).`)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Force logout failed')
    } finally {
      setBusyEmail(null)
    }
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    setUploadNotice(null)
    setDragOver(false)
    try {
      const maxBytes = 8 * 1024 * 1024
      if (file.size > maxBytes) {
        throw new Error('File is too large (max 8 MB).')
      }
      const extract = await parseSeoExcelFile(file)
      const result = await uploadReportExtract(session, extract, file.name)
      setUploadNotice(
        `Uploaded ${file.name} · ${result.brands} brands · ${extract.months.length} months`,
      )
      await loadMeta()
      await loadAudit()
      await onExtractUploaded?.()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteExtract(e: FormEvent) {
    e.preventDefault()
    if (!deletePassword) return
    setDeleting(true)
    setUploadError(null)
    setUploadNotice(null)
    try {
      const result = await deleteReportExtract(session, deletePassword)
      setDeletePassword('')
      setConfirmDelete(false)
      setUploadNotice(result.message)
      await loadMeta()
      await loadAudit()
      await onExtractUploaded?.()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  if (gateChecking) {
    return (
      <div className="app-shell auth-boot">
        <p className="auth-boot__text">Checking admin access…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell auth-boot">
        <p className="auth-boot__text">{error || 'Access denied.'}</p>
      </div>
    )
  }

  return (
    <div className="app-shell admin-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <img
            className="topbar__logo"
            src="/logo.png"
            alt="MCW"
            width={40}
            height={40}
          />
          <div>
            <h1>Admin</h1>
            <p>{session.email}</p>
          </div>
        </div>
        <div className="admin-top-actions">
          <ThemeToggle compact />
          <Link className="nav-btn nav-btn--report" to="/">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5" />
              <path d="M4 19h16" />
              <path d="M8 15v-4" />
              <path d="M12 15V8" />
              <path d="M16 15v-6" />
            </svg>
            Report
          </Link>
          <button
            type="button"
            className="nav-btn nav-btn--logout"
            onClick={() => void onLogout()}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
              <path d="M15 12H3" />
              <path d="m6 9-3 3 3 3" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      <div className="admin-stats">
        <article className="admin-stat">
          <span className="admin-stat__label">Accounts</span>
          <strong className="admin-stat__value">{loading ? '—' : users.length}</strong>
        </article>
        <article className="admin-stat">
          <span className="admin-stat__label">Online now</span>
          <strong className="admin-stat__value">{loading ? '—' : onlineCount}</strong>
        </article>
        <article className="admin-stat">
          <span className="admin-stat__label">Brands</span>
          <strong className="admin-stat__value">{meta?.brandCount ?? 0}</strong>
        </article>
        <article className={`admin-stat ${meta?.hasExtract ? 'is-live' : 'is-empty'}`}>
          <span className="admin-stat__label">Report data</span>
          <strong className="admin-stat__value">
            {meta?.hasExtract ? 'Live' : 'Empty'}
          </strong>
        </article>
      </div>

      <div className="admin-grid">
        <section className="admin-card admin-card--upload">
          <div className="admin-card__head">
            <div className="admin-card__title">
              <span className="admin-card__icon" aria-hidden="true">
                <IconSheet />
              </span>
              <div>
                <h2>Excel upload</h2>
                <p>One workbook · multiple brand sheets · powers the public report</p>
              </div>
            </div>
          </div>

          <label
            className={`upload-zone${dragOver ? ' is-drag' : ''}${uploading ? ' is-busy' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) void handleUpload(file)
              else setDragOver(false)
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
              }}
            />
            <span className="upload-zone__icon">
              <IconUpload />
            </span>
            <span className="upload-zone__title">
              {uploading ? 'Parsing & uploading…' : 'Drop Excel here or browse'}
            </span>
            <span className="upload-zone__hint">
              .xlsx / .xls · allowed brand sheets only: MCW, MXW, B1–B4, K1, G1, TK, BP, JW, NCVIP, M3, C1
            </span>
          </label>

          {uploadError && <p className="form-error">{uploadError}</p>}
          {uploadNotice && <p className="form-notice">{uploadNotice}</p>}

          <div className="meta-chips">
            <div className="meta-chip">
              <span>Source</span>
              <strong title={meta?.source || undefined}>{meta?.source || '—'}</strong>
            </div>
            <div className="meta-chip">
              <span>Uploaded</span>
              <strong>{meta?.uploadedAt ? formatWhen(meta.uploadedAt) : '—'}</strong>
            </div>
            <div className="meta-chip">
              <span>Uploaded by</span>
              <strong title={meta?.uploadedBy || undefined}>
                {meta?.uploadedBy || '—'}
              </strong>
            </div>
            <div className="meta-chip">
              <span>Coverage</span>
              <strong>
                {meta?.brandCount ?? 0} brands · {meta?.monthCount ?? 0} months
              </strong>
            </div>
          </div>

          {meta?.hasExtract ? (
            <div className="delete-extract">
              {!confirmDelete ? (
                <button
                  type="button"
                  className="nav-btn nav-btn--logout delete-extract__trigger"
                  disabled={uploading || deleting}
                  onClick={() => {
                    setConfirmDelete(true)
                    setUploadError(null)
                    setUploadNotice(null)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  Delete uploaded file
                </button>
              ) : (
                <form className="delete-extract__form" onSubmit={handleDeleteExtract}>
                  <p className="delete-extract__warn">
                    This clears the performance dashboard. Enter your admin password to confirm.
                  </p>
                  <label className="field">
                    <span>Admin password</span>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={deleting}
                      required
                      autoFocus
                      placeholder="Your account password"
                    />
                  </label>
                  <div className="delete-extract__actions">
                    <button
                      type="submit"
                      className="primary-btn danger-btn"
                      disabled={deleting || !deletePassword}
                    >
                      {deleting ? 'Deleting…' : 'Confirm delete'}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={deleting}
                      onClick={() => {
                        setConfirmDelete(false)
                        setDeletePassword('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </section>

        <section className="admin-card">
          <div className="admin-card__head">
            <div className="admin-card__title">
              <span className="admin-card__icon" aria-hidden="true">
                <IconUsers />
              </span>
              <div>
                <h2>Create account</h2>
                <p>Operators sign in at /login and must enable 2FA</p>
              </div>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleCreate}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                disabled={creating}
                placeholder="name@company.com"
              />
            </label>
            <label className="field">
              <span>Temp password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                disabled={creating}
                placeholder="12+ chars · letters & numbers"
              />
            </label>
            <button
              type="submit"
              className="primary-btn"
              disabled={creating || !email.trim() || password.length < 12}
            >
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}
        </section>

        <section className="admin-card admin-card--wide">
          <div className="admin-card__head">
            <div className="admin-card__title">
              <span className="admin-card__icon" aria-hidden="true">
                <IconUsers />
              </span>
              <div>
                <h2>Accounts</h2>
                <p>{loading ? 'Loading…' : `${users.length} users`}</p>
              </div>
            </div>
          </div>

          <div className="account-list">
            {users.map((user) => (
              <article key={user.email} className="account-row">
                <div className="account-row__identity">
                  <span className="account-avatar" aria-hidden="true">
                    {initials(user.email)}
                  </span>
                  <div>
                    <strong className="account-row__email">{user.email}</strong>
                    <div className="account-badges">
                      <span className={`badge-pill badge-pill--${user.role}`}>
                        {roleLabel(user.role)}
                      </span>
                      <span
                        className={`badge-pill ${user.totpEnabled ? 'badge-pill--ok' : 'badge-pill--warn'}`}
                      >
                        {user.totpEnabled ? '2FA on' : '2FA setup'}
                      </span>
                      <span
                        className={`badge-pill ${user.online ? 'badge-pill--live' : ''}`}
                      >
                        {user.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="account-actions">
                  {passwordEmail === user.email ? (
                    <div className="inline-reset">
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (12+)"
                        minLength={12}
                      />
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={busyEmail === user.email}
                        onClick={() => void handleResetPassword(user.email)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setPasswordEmail(null)
                          setNewPassword('')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={busyEmail === user.email}
                        onClick={() => setPasswordEmail(user.email)}
                      >
                        Reset Password
                      </button>
                      {user.role !== 'superadmin' && (
                        <>
                          <button
                            type="button"
                            className="ghost-btn"
                            disabled={busyEmail === user.email}
                            onClick={() => void handleForceLogout(user)}
                          >
                            Logout
                          </button>
                          <button
                            type="button"
                            className="ghost-btn danger"
                            disabled={busyEmail === user.email}
                            onClick={() => void handleDelete(user)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
            {!loading && users.length === 0 ? (
              <p className="empty-report">No accounts yet.</p>
            ) : null}
          </div>
        </section>

        <section className="admin-card admin-card--wide admin-audit">
          <div className="admin-card__head">
            <div className="admin-card__title">
              <span className="admin-card__icon" aria-hidden="true">
                <IconAudit />
              </span>
              <div>
                <h2>Audit logs</h2>
                <p>Login activity and who uploaded or deleted Excel data</p>
              </div>
            </div>
            <button
              type="button"
              className="ghost-btn"
              disabled={auditRefreshing}
              onClick={() => void loadAudit()}
            >
              {auditRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="admin-audit-tabs" role="tablist" aria-label="Audit filters">
            <button
              type="button"
              role="tab"
              aria-selected={auditTab === 'login'}
              className={`admin-audit-tab${auditTab === 'login' ? ' is-active' : ''}`}
              onClick={() => setAuditTab('login')}
            >
              Login <span>{loginCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={auditTab === 'excel'}
              className={`admin-audit-tab${auditTab === 'excel' ? ' is-active' : ''}`}
              onClick={() => setAuditTab('excel')}
            >
              Excel <span>{excelCount}</span>
            </button>
          </div>

          {auditError ? <p className="form-error">{auditError}</p> : null}

          {auditLoading && auditEvents.length === 0 ? (
            <p className="empty-report">Loading audit log…</p>
          ) : filteredAudit.length === 0 ? (
            <p className="empty-report">No events in this tab yet.</p>
          ) : (
            <ul className="admin-audit-list">
              {filteredAudit.map((ev) => {
                const actor = actorFromEvent(ev)
                return (
                  <li key={ev.id} className="admin-audit-item">
                    <div className="admin-audit-item-top">
                      <strong>{actionLabel(ev.action)}</strong>
                      <span>{formatWhen(ev.at)}</span>
                    </div>
                    <div className="admin-audit-item-meta">
                      {actor ? (
                        <span className="admin-audit-actor">{actor}</span>
                      ) : (
                        <span className="admin-audit-actor is-unknown">
                          Unknown user
                        </span>
                      )}
                      <span>{ev.ip}</span>
                    </div>
                    {ev.changes && ev.changes.length > 0 ? (
                      <ul className="admin-audit-changes">
                        {ev.changes.map((change) => (
                          <li key={`${ev.id}-${change}`}>{change}</li>
                        ))}
                      </ul>
                    ) : ev.detail ? (
                      <p className="admin-audit-detail">{ev.detail}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <footer className="app-footer">
        <span>Developed by Aris</span>
      </footer>
    </div>
  )
}
