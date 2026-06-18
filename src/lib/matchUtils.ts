export function generateMatchCode(): string {
  const num = Math.floor(10000 + Math.random() * 90000)
  return `CRK-${num}`
}

export function generateJoinToken(): string {
  // URL-safe random token
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function buildJoinUrl(joinToken: string): string {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '')
  return `${base}/#/join/${joinToken}`
}

export function buildWhatsAppShareMessage(matchName: string, dateStr: string, timeStr: string | null, joinUrl: string): string {
  const lines = [
    `🏏 ${matchName}`,
    `📅 ${dateStr}${timeStr ? ` at ${timeStr}` : ''}`,
    ``,
    `Tap to confirm if you're playing:`,
    joinUrl,
  ]
  return encodeURIComponent(lines.join('\n'))
}
