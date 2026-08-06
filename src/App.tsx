import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { LoginScreen } from './components/LoginScreen'
import { SecurityPanel } from './components/SecurityPanel'
import { AdminDashboard } from './components/AdminDashboard'
import { ReportPage } from './pages/ReportPage'
import {
  createPerformanceApi,
  EMPTY_EXTRACT,
  isReportExtract,
} from './data/performanceData'
import {
  fetchReportExtract,
  fetchSessionMe,
  heartbeatWorker,
  loginWithCredentials,
  logoutWorker,
  verify2fa,
  type UserRole,
  type WorkerSession,
} from './lib/workerApi'
import type { ReportExtract } from './types'
import './App.css'

/** Same-origin via Vite proxy in dev; empty string keeps cookies on this host. */
const WORKER_URL = ''

export default function App() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [booting, setBooting] = useState(true)
  const [session, setSession] = useState<WorkerSession | null>(null)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [role, setRole] = useState<UserRole | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [extract, setExtract] = useState<ReportExtract>(EMPTY_EXTRACT)

  const resetToken = searchParams.get('resetToken')

  const clearResetToken = useCallback(() => {
    if (!searchParams.has('resetToken')) return
    const next = new URLSearchParams(searchParams)
    next.delete('resetToken')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const loadExtract = useCallback(async () => {
    try {
      const remote = await fetchReportExtract({ workerUrl: WORKER_URL })
      if (isReportExtract(remote)) {
        setExtract(remote)
        return
      }
    } catch {
      /* keep empty when API unavailable */
    }
    setExtract(EMPTY_EXTRACT)
  }, [])

  const applySession = useCallback(
    async (email: string, nextTotp?: boolean) => {
      const me = await fetchSessionMe(WORKER_URL)
      if (!me?.authenticated) {
        throw new Error('Session was not established.')
      }
      setSession({
        workerUrl: WORKER_URL,
        email: me.email || email,
        role: me.role,
      })
      setRole(me.role)
      setTotpEnabled(nextTotp ?? me.totpEnabled)
      setChallengeToken(null)
      setAuthError(null)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadExtract()
        const me = await fetchSessionMe(WORKER_URL)
        if (cancelled) return
        if (me?.authenticated) {
          setSession({
            workerUrl: WORKER_URL,
            email: me.email,
            role: me.role,
          })
          setRole(me.role)
          setTotpEnabled(me.totpEnabled)
        }
      } catch {
        /* public report still works */
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadExtract])

  useEffect(() => {
    if (!session || !totpEnabled) return
    const id = window.setInterval(() => {
      void heartbeatWorker(session).catch(() => {
        /* idle expiry handled on next navigation */
      })
    }, 30_000)
    return () => window.clearInterval(id)
  }, [session, totpEnabled])

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setAuthLoading(true)
      setAuthError(null)
      setAuthNotice(null)
      try {
        const result = await loginWithCredentials(WORKER_URL, email, password)
        if (result.requires2fa && result.challengeToken) {
          setChallengeToken(result.challengeToken)
          return false
        }
        await applySession(result.email || email, result.totpEnabled)
        navigate(result.totpEnabled ? '/admin' : '/login')
        return true
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Login failed')
        return false
      } finally {
        setAuthLoading(false)
      }
    },
    [applySession, navigate],
  )

  const handleVerify2fa = useCallback(
    async (token: string, code: string) => {
      setAuthLoading(true)
      setAuthError(null)
      try {
        const result = await verify2fa(WORKER_URL, token, code)
        await applySession(result.email || '', true)
        navigate('/admin')
        return true
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : '2FA failed')
        return false
      } finally {
        setAuthLoading(false)
      }
    },
    [applySession, navigate],
  )

  const handleLogout = useCallback(async () => {
    if (session) {
      try {
        await logoutWorker(session)
      } catch {
        /* ignore */
      }
    }
    setSession(null)
    setRole(null)
    setTotpEnabled(false)
    setChallengeToken(null)
    navigate('/')
  }, [session, navigate])

  const api = useMemo(() => createPerformanceApi(extract), [extract])
  const canAdmin = Boolean(session && totpEnabled && role === 'superadmin')

  if (booting) {
    return (
      <div className="app-shell auth-boot">
        <p className="auth-boot__text">Loading report…</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <ReportPage
            api={api}
            showAdmin={canAdmin}
            onLogout={canAdmin ? handleLogout : undefined}
          />
        }
      />

      <Route
        path="/login"
        element={
          session && !totpEnabled ? (
            <div className="login-page">
              <div className="login-atmosphere" aria-hidden="true" />
              <div className="login-shell login-shell--wide">
                <SecurityPanel
                  session={session}
                  totpEnabled={false}
                  mandatorySetup
                  onTotpChange={async (enabled) => {
                    setTotpEnabled(enabled)
                    if (enabled) navigate('/admin')
                  }}
                />
              </div>
            </div>
          ) : canAdmin ? (
            <Navigate to="/admin" replace />
          ) : (
            <LoginScreen
              workerUrl={WORKER_URL}
              onLogin={handleLogin}
              onVerify2fa={handleVerify2fa}
              error={authError}
              loading={authLoading}
              challengeToken={challengeToken}
              notice={authNotice}
              resetToken={resetToken}
              onClearResetToken={clearResetToken}
            />
          )
        }
      />

      <Route
        path="/admin"
        element={
          !session ? (
            <Navigate
              to={
                resetToken
                  ? `/login?resetToken=${encodeURIComponent(resetToken)}`
                  : '/login'
              }
              replace
            />
          ) : !totpEnabled ? (
            <Navigate to="/login" replace />
          ) : role !== 'superadmin' ? (
            <Navigate to="/" replace />
          ) : (
            <AdminDashboard
              session={session}
              onLogout={handleLogout}
              onAccessDenied={async () => navigate('/')}
              onExtractUploaded={async () => {
                await loadExtract()
              }}
            />
          )
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
