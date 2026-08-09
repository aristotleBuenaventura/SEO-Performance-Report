import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createAdminUser,
  deleteAdminUser,
  deleteReportExtract,
  fetchReportExtractMeta,
  fetchSessionMe,
  forceLogoutAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
  uploadReportExtract,
  type ManagedUser,
  type ReportExtractMeta,
  type WorkerSession,
} from '../lib/workerApi'
import { parseSeoExcelFile } from '../lib/excelParse'
import { ThemeToggle } from './ThemeToggle'

interface AdminDashboardProps {
  session: WorkerSession
  onLogout: () => void | Promise<void>
  onAccessDenied?: () => void | Promise<void>
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

export function AdminDashboard({
  session,
  onLogout,
  onAccessDenied,
  onExtractUploaded,
}: AdminDashboardProps) {
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await fetchSessionMe(session.workerUrl)
        if (cancelled) return
        if (!me?.authenticated || me.role !== 'superadmin') {
          setAllowed(false)
          setGateChecking(false)
          setError('Superadmin access required.')
          if (onAccessDenied) await onAccessDenied()
          else await onLogout()
          return
        }
        setAllowed(true)
      } catch {
        if (!cancelled) {
          setAllowed(false)
          setError('Could not verify superadmin session.')
          if (onAccessDenied) await onAccessDenied()
          else await onLogout()
        }
      } finally {
        if (!cancelled) setGateChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.workerUrl, onLogout, onAccessDenied])

  const loadUsers = useCallback(async () => {
    try {
      const list = await listAdminUsers(session)
      setUsers(list)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load accounts'
      setError(msg)
      if (/superadmin|forbidden|403/i.test(msg)) {
        setAllowed(false)
        if (onAccessDenied) await onAccessDenied()
      }
    } finally {
      setLoading(false)
    }
  }, [session, onAccessDenied])

  const loadMeta = useCallback(async () => {
    try {
      const next = await fetchReportExtractMeta(session)
      setMeta(next)
    } catch {
      /* ignore */
    }
  }, [session])

  useEffect(() => {
    if (!allowed) return
    void loadUsers()
    void loadMeta()
  }, [allowed, loadUsers, loadMeta])

  const onlineCount = useMemo(
    () => users.filter((u) => u.online).length,
    [users],
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
                        Reset pw
                      </button>
                      {user.role !== 'superadmin' && (
                        <>
                          <button
                            type="button"
                            className="ghost-btn"
                            disabled={busyEmail === user.email}
                            onClick={() => void handleForceLogout(user)}
                          >
                            Kick
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
      </div>
    </div>
  )
}
