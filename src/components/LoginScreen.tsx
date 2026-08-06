import { useEffect, useState, type FormEvent } from 'react'
import {
  forgotPassword,
  resetPassword,
} from '../lib/workerApi'
import { ThemeToggle } from './ThemeToggle'

type AuthMode = 'login' | 'forgot' | 'reset'

interface LoginScreenProps {
  workerUrl: string
  onLogin: (email: string, password: string) => Promise<boolean>
  onVerify2fa: (challengeToken: string, code: string) => Promise<boolean>
  error: string | null
  loading: boolean
  challengeToken: string | null
  notice?: string | null
  resetToken?: string | null
  onClearResetToken?: () => void
}

const COOLDOWN_STORAGE_KEY = 'seo-report-pw-reset-cooldown'

function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m <= 0) return `${s}s`
  return `${m}:${String(s).padStart(2, '0')}`
}

function readCooldownMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function remainingForEmail(email: string): number {
  const endsAt = readCooldownMap()[email.trim().toLowerCase()] ?? 0
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
}

function persistCooldown(email: string, seconds: number) {
  const key = email.trim().toLowerCase()
  if (!key || seconds <= 0) return
  const map = readCooldownMap()
  const now = Date.now()
  for (const [e, endsAt] of Object.entries(map)) {
    if (endsAt <= now) delete map[e]
  }
  map[key] = now + seconds * 1000
  localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(map))
}

export function LoginScreen({
  workerUrl,
  onLogin,
  onVerify2fa,
  error,
  loading,
  challengeToken,
  notice = null,
  resetToken = null,
  onClearResetToken,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>(() =>
    resetToken ? 'reset' : 'login',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)

  useEffect(() => {
    if (resetToken) setMode('reset')
  }, [resetToken])

  useEffect(() => {
    setCooldownLeft(remainingForEmail(email))
  }, [email])

  useEffect(() => {
    if (cooldownLeft <= 0) return
    const id = window.setTimeout(() => {
      setCooldownLeft(remainingForEmail(email))
    }, 1000)
    return () => window.clearTimeout(id)
  }, [cooldownLeft, email])

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLocalError(null)
    setMessage(null)
    await onLogin(email.trim(), password)
  }

  async function handle2faSubmit(e: FormEvent) {
    e.preventDefault()
    if (!challengeToken || !code.trim()) return
    setLocalError(null)
    await onVerify2fa(challengeToken, code.trim())
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    const normalized = email.trim()
    if (!normalized) return

    const localRemaining = remainingForEmail(normalized)
    if (localRemaining > 0) {
      setCooldownLeft(localRemaining)
      setLocalError(
        `Please wait ${formatWait(localRemaining)} before requesting another link.`,
      )
      setMessage(null)
      return
    }

    setLocalError(null)
    setMessage(null)
    setBusy(true)
    try {
      const result = await forgotPassword(workerUrl, normalized)
      persistCooldown(normalized, result.retryAfterSeconds)
      setCooldownLeft(result.retryAfterSeconds)
      setMessage(result.message)
    } catch (err) {
      const retry = (err as Error & { retryAfterSeconds?: number })
        .retryAfterSeconds
      if (retry) {
        persistCooldown(normalized, retry)
        setCooldownLeft(retry)
      }
      setLocalError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    setMessage(null)
    if (!resetToken) {
      setLocalError('Missing reset token. Request a new password reset link.')
      return
    }
    if (password.length < 12) {
      setLocalError('Password must be at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await resetPassword(workerUrl, resetToken, password)
      setPassword('')
      setConfirm('')
      setMessage(result.message)
      setMode('login')
      onClearResetToken?.()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  const needs2fa = Boolean(challengeToken)
  const displayError = localError || error
  const forgotBlocked = busy || cooldownLeft > 0

  function goLogin() {
    setMode('login')
    setLocalError(null)
    setMessage(null)
    onClearResetToken?.()
  }

  const title = needs2fa
    ? '2FA'
    : mode === 'forgot'
      ? 'Forgot password'
      : mode === 'reset'
        ? 'Reset password'
        : 'Login'

  const lede = needs2fa
    ? 'Enter the 6-digit code from your authenticator app.'
    : mode === 'forgot'
      ? 'Enter your account email and we’ll send a reset link if it exists.'
      : mode === 'reset'
        ? 'Choose a new password for your account.'
        : 'Sign in to manage accounts and upload Excel data.'

  return (
    <div className="login-page">
      <div className="login-atmosphere" aria-hidden="true" />
      <div className="login-shell">
        <header className="login-brand">
          <h1 className="login-title">{title}</h1>
          <p className="login-lede">{lede}</p>
        </header>

        <ThemeToggle compact={false} className="login-theme" />

        {needs2fa ? (
          <form className="login-form" onSubmit={handle2faSubmit}>
            <label className="field" htmlFor="totp-code">
              <span>Authenticator code</span>
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                disabled={loading}
                maxLength={8}
              />
            </label>
            {displayError && <p className="form-error">{displayError}</p>}
            <button
              type="submit"
              className="primary-btn login-submit"
              disabled={loading || code.trim().length < 6}
            >
              {loading ? 'Verifying…' : 'Verify 2FA'}
            </button>
            <button
              type="button"
              className="auth-alt-btn"
              onClick={goLogin}
            >
              Back to login
            </button>
          </form>
        ) : mode === 'forgot' ? (
          <form className="login-form" onSubmit={handleForgotSubmit}>
            <label className="field" htmlFor="forgot-email">
              <span>Email</span>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={busy}
                autoFocus
                required
              />
            </label>
            {displayError && <p className="form-error">{displayError}</p>}
            {message && <p className="form-notice">{message}</p>}
            {cooldownLeft > 0 ? (
              <p className="form-hint">
                You can request another link in {formatWait(cooldownLeft)}.
              </p>
            ) : null}
            <button
              type="submit"
              className="primary-btn login-submit"
              disabled={forgotBlocked || !email.trim()}
            >
              {busy
                ? 'Sending…'
                : cooldownLeft > 0
                  ? `Wait ${formatWait(cooldownLeft)}`
                  : 'Send reset link'}
            </button>
            <button type="button" className="auth-alt-btn" onClick={goLogin}>
              Back to login
            </button>
          </form>
        ) : mode === 'reset' ? (
          <form className="login-form" onSubmit={handleResetSubmit}>
            {!resetToken ? (
              <>
                <p className="form-error">
                  This reset link is missing or incomplete.
                </p>
                <button
                  type="button"
                  className="primary-btn login-submit"
                  onClick={() => {
                    setMode('forgot')
                    setLocalError(null)
                  }}
                >
                  Request a new reset link
                </button>
              </>
            ) : (
              <>
                <label className="field" htmlFor="new-password">
                  <span>New password</span>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                    autoComplete="new-password"
                    autoFocus
                    disabled={busy}
                    placeholder="At least 12 characters + letters & numbers"
                  />
                </label>
                <label className="field" htmlFor="confirm-password">
                  <span>Confirm password</span>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={12}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </label>
                {displayError && <p className="form-error">{displayError}</p>}
                <button
                  type="submit"
                  className="primary-btn login-submit"
                  disabled={busy || !password || !confirm}
                >
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </>
            )}
            <button type="button" className="auth-alt-btn" onClick={goLogin}>
              Back to login
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handlePasswordSubmit}>
            {notice || message ? (
              <p className="form-notice">{notice || message}</p>
            ) : null}
            <label className="field" htmlFor="email">
              <span>Email</span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                disabled={loading}
              />
            </label>

            <label className="field" htmlFor="password">
              <span>Password</span>
              <div className="token-row">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="ghost-btn password-reveal-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {displayError && <p className="form-error">{displayError}</p>}

            <button
              type="submit"
              className="primary-btn login-submit"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              className="auth-alt-btn"
              onClick={() => {
                setMode('forgot')
                setLocalError(null)
                setMessage(null)
              }}
            >
              Forgot password?
            </button>
          </form>
        )}
      </div>
      <footer className="app-footer">
        <span>Developed by Aris</span>
      </footer>
    </div>
  )
}
