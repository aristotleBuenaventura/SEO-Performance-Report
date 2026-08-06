/**
 * Minimal TOTP (RFC 6238) using Web Crypto — HMAC-SHA1, 30s step, 6 digits.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(bytes = 20): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return base32Encode(buf)
}

export function buildOtpauthUrl(opts: {
  secret: string
  label?: string
  issuer?: string
}): string {
  const issuer = opts.issuer || 'SEO Report'
  const label = opts.label || 'admin'
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?${params}`
}

export async function verifyTotpCode(
  secret: string,
  token: string,
  window = 1,
): Promise<boolean> {
  const code = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return false
  const key = base32Decode(secret)
  const now = Math.floor(Date.now() / 1000)
  const step = 30
  const counter = Math.floor(now / step)
  for (let w = -window; w <= window; w++) {
    const expected = await hotp(key, counter + w)
    if (expected === code) return true
  }
  return false
}

async function hotp(key: Uint8Array, counter: number): Promise<string> {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  // big-endian 64-bit counter (high 32 always 0 for practical counters)
  view.setUint32(0, 0)
  view.setUint32(4, counter >>> 0)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, buf),
  )
  const offset = sig[sig.length - 1]! & 0x0f
  const bin =
    ((sig[offset]! & 0x7f) << 24) |
    ((sig[offset + 1]! & 0xff) << 16) |
    ((sig[offset + 2]! & 0xff) << 8) |
    (sig[offset + 3]! & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

function base32Encode(data: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of data) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}
