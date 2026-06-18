// Phase 1 has no auth system. We identify the current device's player
// via localStorage so returning players don't have to re-enter details.
// This is NOT a security boundary — it's just a convenience.

const PLAYER_ID_KEY = 'matchmates_player_id'

export function getStoredPlayerId(): string | null {
  return localStorage.getItem(PLAYER_ID_KEY)
}

export function setStoredPlayerId(id: string) {
  localStorage.setItem(PLAYER_ID_KEY, id)
}

export function clearStoredPlayerId() {
  localStorage.removeItem(PLAYER_ID_KEY)
}
