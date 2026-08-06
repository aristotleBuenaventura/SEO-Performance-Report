/**
 * Minimal SMTP client for Gmail (TLS on 465) via Cloudflare sockets.
 * Mirrors MR-Database-Tool: SMTP_USER / SMTP_PASS / SMTP_FROM.
 */
import { connect } from 'cloudflare:sockets'

export interface SmtpEnv {
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
}

function b64(value: string): string {
  return btoa(value)
}

async function readResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { text: string },
): Promise<{ code: number; lines: string[] }> {
  const decoder = new TextDecoder()
  const lines: string[] = []

  while (true) {
    while (!buffer.text.includes('\n')) {
      const { value, done } = await reader.read()
      if (done) throw new Error('SMTP connection closed unexpectedly.')
      buffer.text += decoder.decode(value, { stream: true })
    }

    const nl = buffer.text.indexOf('\n')
    const rawLine = buffer.text.slice(0, nl).replace(/\r$/, '')
    buffer.text = buffer.text.slice(nl + 1)
    lines.push(rawLine)

    // Multi-line: "250-..." continues; "250 ..." ends.
    if (/^\d{3}[\s-]/.test(rawLine) && rawLine[3] === ' ') {
      const code = Number(rawLine.slice(0, 3))
      return { code, lines }
    }
  }
}

async function expect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { text: string },
  writer: WritableStreamDefaultWriter<Uint8Array>,
  command: string | null,
  okCodes: number[],
): Promise<void> {
  const encoder = new TextEncoder()
  if (command !== null) {
    await writer.write(encoder.encode(`${command}\r\n`))
  }
  const res = await readResponse(reader, buffer)
  if (!okCodes.includes(res.code)) {
    throw new Error(
      `SMTP error ${res.code}: ${res.lines.join(' | ') || 'unknown'}`,
    )
  }
}

export async function sendPasswordResetEmail(
  env: SmtpEnv,
  options: { to: string; resetUrl: string },
): Promise<{ sent: boolean; logged: boolean }> {
  const host = env.SMTP_HOST?.trim()
  const user = env.SMTP_USER?.trim()
  const pass = env.SMTP_PASS?.trim()
  const from =
    env.SMTP_FROM?.trim() ||
    (user ? `SEO Report <${user}>` : 'SEO Report <noreply@localhost>')
  const port = Number(env.SMTP_PORT || 465)

  const subject = 'Reset your SEO Report password'
  const text = [
    'You requested a password reset for your SEO Report account.',
    '',
    'Open this link to set a new password (expires in 1 hour):',
    options.resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  const html = `
    <p>You requested a password reset for your <strong>SEO Report</strong> account.</p>
    <p><a href="${options.resetUrl}">Set a new password</a></p>
    <p>This link expires in <strong>1 hour</strong>.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `.trim()

  if (!host || !user || !pass) {
    console.warn(
      '[email] SMTP not configured. Password reset requested (link omitted from logs).',
    )
    return { sent: false, logged: true }
  }

  const socket = connect(
    {
      hostname: host,
      port,
    },
    {
      secureTransport: port === 465 ? 'on' : 'starttls',
      allowHalfOpen: false,
    },
  )

  const reader = socket.readable.getReader()
  const writer = socket.writable.getWriter()
  const buffer = { text: '' }

  try {
    await expect(reader, buffer, writer, null, [220])
    await expect(reader, buffer, writer, `EHLO seo-report`, [250])
    await expect(reader, buffer, writer, 'AUTH LOGIN', [334])
    await expect(reader, buffer, writer, b64(user), [334])
    await expect(reader, buffer, writer, b64(pass), [235])

    const fromAddr = user
    await expect(reader, buffer, writer, `MAIL FROM:<${fromAddr}>`, [250])
    await expect(reader, buffer, writer, `RCPT TO:<${options.to}>`, [250, 251])
    await expect(reader, buffer, writer, 'DATA', [354])

    const headers = [
      `From: ${from}`,
      `To: ${options.to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="seo-report-boundary"',
      '',
      '--seo-report-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      '',
      '--seo-report-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      '',
      '--seo-report-boundary--',
      '.',
    ].join('\r\n')

    await expect(reader, buffer, writer, headers, [250])
    await expect(reader, buffer, writer, 'QUIT', [221, 250])
    return { sent: true, logged: false }
  } finally {
    try {
      writer.releaseLock()
    } catch {
      /* ignore */
    }
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
    try {
      socket.close()
    } catch {
      /* ignore */
    }
  }
}
