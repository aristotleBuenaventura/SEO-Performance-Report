/** Shared Worker env typing (imported by security helpers). */
export interface Env {
  CONFIG: KVNamespace
  ADMIN_SECRET: string
  /** Optional dedicated HMAC key for session cookies (preferred over ADMIN_SECRET). */
  SESSION_SIGNING_SECRET?: string
  ALLOWED_ORIGINS?: string
  IP_ALLOWLIST?: string
  COOKIE_SAMESITE?: string
  /** Set true when UI is on the public internet */
  PUBLIC_INTERNET?: string
  /** When true with PUBLIC_INTERNET, bind sessions to client IP */
  BIND_SESSION_IP?: string
  /** Public UI origin for password-reset links (e.g. http://localhost:5173) */
  APP_URL?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
}
