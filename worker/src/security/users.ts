import { randomId, timingSafeEqual } from './crypto'

export type UserRole = 'superadmin' | 'admin'

export interface UserRecord {
  email: string
  passwordHash: string
  role: UserRole
  /** Bumped on password change to invalidate older sessions. */
  passwordVersion: number
  totpEnabled: boolean
  totpSecret: string | null
  pendingTotpSecret: string | null
  createdAt: string
  updatedAt: string
}

export interface PublicUser {
  email: string
  role: UserRole
  totpEnabled: boolean
  createdAt: string
  updatedAt: string
}

const USERS_INDEX_KEY = 'users_index'

function userKey(email: string): string {
  return `user:${normalizeEmail(email)}`
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

export function normalizeRole(role: unknown): UserRole {
  return role === 'superadmin' ? 'superadmin' : 'admin'
}

function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export async function hashPassword(password: string): Promise<string> {
  // Cloudflare Workers WebCrypto caps PBKDF2 at 100_000 iterations.
  const iterations = 100_000
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    key,
    256,
  )
  return `pbkdf2$${iterations}$${bufferToHex(salt)}$${bufferToHex(bits)}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = hexToBytes(parts[2]!)
  const expected = parts[3]!
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    key,
    256,
  )
  return timingSafeEqual(bufferToHex(bits), expected)
}

function hydrateUser(raw: UserRecord): UserRecord {
  return {
    ...raw,
    role: normalizeRole(raw.role),
    passwordVersion:
      typeof raw.passwordVersion === 'number' && raw.passwordVersion >= 0
        ? raw.passwordVersion
        : 0,
  }
}

export async function getUser(
  kv: KVNamespace,
  email: string,
): Promise<UserRecord | null> {
  const raw = await kv.get(userKey(email))
  if (!raw) return null
  try {
    return hydrateUser(JSON.parse(raw) as UserRecord)
  } catch {
    return null
  }
}

async function readUsersIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(USERS_INDEX_KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as string[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function addToUsersIndex(kv: KVNamespace, email: string): Promise<void> {
  const list = await readUsersIndex(kv)
  const normalized = normalizeEmail(email)
  if (!list.includes(normalized)) {
    list.push(normalized)
    await kv.put(USERS_INDEX_KEY, JSON.stringify(list))
  }
}

async function removeFromUsersIndex(
  kv: KVNamespace,
  email: string,
): Promise<void> {
  const normalized = normalizeEmail(email)
  const list = (await readUsersIndex(kv)).filter((e) => e !== normalized)
  await kv.put(USERS_INDEX_KEY, JSON.stringify(list))
}

export async function countUsers(kv: KVNamespace): Promise<number> {
  return (await readUsersIndex(kv)).length
}

export async function listUsers(kv: KVNamespace): Promise<PublicUser[]> {
  const emails = await readUsersIndex(kv)
  const users: PublicUser[] = []
  for (const email of emails) {
    const user = await getUser(kv, email)
    if (!user) continue
    users.push({
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  }
  users.sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === 'superadmin' ? -1 : 1
    }
    return a.email.localeCompare(b.email)
  })
  return users
}

export function assertStrongPassword(password: string): void {
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters.')
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must include letters and numbers.')
  }
}

export function assertStrongAdminSecret(secret: string): void {
  if (!secret || secret.length < 16) {
    throw new Error(
      'ADMIN_SECRET must be at least 16 characters on this server.',
    )
  }
  if (/change-me|dev-admin|password|^secret$/i.test(secret)) {
    throw new Error('ADMIN_SECRET looks like a placeholder — set a strong value.')
  }
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function putUser(kv: KVNamespace, user: UserRecord): Promise<void> {
  const next = hydrateUser(user)
  await kv.put(userKey(next.email), JSON.stringify(next))
  await addToUsersIndex(kv, next.email)
}

export async function createUser(
  kv: KVNamespace,
  email: string,
  password: string,
  role: UserRole = 'admin',
): Promise<UserRecord> {
  const normalized = normalizeEmail(email)
  if (!isValidEmail(normalized)) {
    throw new Error('Invalid email address.')
  }
  assertStrongPassword(password)
  const existing = await getUser(kv, normalized)
  if (existing) {
    throw new Error('An account with this email already exists.')
  }
  const now = new Date().toISOString()
  const user: UserRecord = {
    email: normalized,
    passwordHash: await hashPassword(password),
    role: normalizeRole(role),
    passwordVersion: 0,
    totpEnabled: false,
    totpSecret: null,
    pendingTotpSecret: null,
    createdAt: now,
    updatedAt: now,
  }
  await putUser(kv, user)
  return user
}

export async function upsertUserPassword(
  kv: KVNamespace,
  email: string,
  password: string,
  role?: UserRole,
): Promise<UserRecord> {
  const normalized = normalizeEmail(email)
  assertStrongPassword(password)
  const existing = await getUser(kv, normalized)
  if (existing) {
    // Password-only update — never change role via upsert (prevents demotion).
    const next: UserRecord = {
      ...existing,
      passwordHash: await hashPassword(password),
      passwordVersion: (existing.passwordVersion ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    await putUser(kv, next)
    return next
  }
  return createUser(kv, normalized, password, role ?? 'admin')
}

export async function setUserPassword(
  kv: KVNamespace,
  email: string,
  password: string,
): Promise<UserRecord> {
  const user = await getUser(kv, email)
  if (!user) throw new Error('User not found.')
  assertStrongPassword(password)
  const next: UserRecord = {
    ...user,
    passwordHash: await hashPassword(password),
    passwordVersion: (user.passwordVersion ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  }
  await putUser(kv, next)
  return next
}

/** Bump passwordVersion so existing cookies fail auth without changing the password. */
export async function bumpSessionVersion(
  kv: KVNamespace,
  email: string,
): Promise<UserRecord> {
  const user = await getUser(kv, email)
  if (!user) throw new Error('User not found.')
  const next: UserRecord = {
    ...user,
    passwordVersion: (user.passwordVersion ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  }
  await putUser(kv, next)
  return next
}

export async function deleteUser(
  kv: KVNamespace,
  email: string,
): Promise<void> {
  const user = await getUser(kv, email)
  if (!user) throw new Error('User not found.')
  if (user.role === 'superadmin') {
    throw new Error('Cannot delete a superadmin account.')
  }
  await kv.delete(userKey(user.email))
  await removeFromUsersIndex(kv, user.email)
}

export async function ensureUserIndexed(
  kv: KVNamespace,
  email: string,
): Promise<void> {
  await addToUsersIndex(kv, email)
}

export function newPendingId(): string {
  return randomId(8)
}
