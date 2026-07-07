export function generateCode(): string {
  const num = Math.floor(10000 + Math.random() * 90000)
  return `CRK-${num}`
}

export function generateJoinToken(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function generateAdminToken(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

export function buildJoinUrl(joinToken: string): string {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '')
  return `${base}/#/join/${joinToken}`
}

export function buildWhatsAppMessage(eventName: string, dateStr: string, timeStr: string | null, joinUrl: string): string {
  const lines = [
    `🏏 ${eventName}`,
    `📅 ${dateStr}${timeStr ? ` at ${timeStr}` : ''}`,
    '',
    'Tap to confirm if you\'re playing:',
    joinUrl,
  ]
  return encodeURIComponent(lines.join('\n'))
}

export function cleanPlayerName(raw: string): string {
  return raw
    .replace(/^\d+\s*[.)]\s*/, '')
    .replace(/^\d+\s+/, '')
    .replace(/^[-•*]\s*/, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim()
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}
