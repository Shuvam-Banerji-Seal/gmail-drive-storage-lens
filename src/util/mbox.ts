// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds a standard mbox file from raw RFC 822 messages, so an archive opens in Thunderbird, Apple Mail, etc.

export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** mboxrd escaping: any line that starts with zero or more '>' followed by "From " gets one more '>'. */
export function escapeFromLines(text: string): string {
  return text.replace(/^(>*From )/gm, '>$1')
}

export function toMbox(messages: Array<{ raw: string; date?: number }>): string {
  const parts: string[] = []
  const latin1 = new TextDecoder('latin1')
  for (const m of messages) {
    const body = latin1.decode(base64UrlToBytes(m.raw)).replace(/\r\n/g, '\n')
    const when = new Date(m.date ?? 0).toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (.*) GMT$/, '$1 $3 $2 $5 $4')
    parts.push(`From storage-lens@localhost ${when}\n${escapeFromLines(body)}${body.endsWith('\n') ? '' : '\n'}\n`)
  }
  return parts.join('')
}
