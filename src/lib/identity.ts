const PLAYER_ID_KEY = 'matchmates_player_id'

export function getStoredPlayerId(): string | null {
  return localStorage.getItem(PLAYER_ID_KEY)
}

export function setStoredPlayerId(id: string) {
  localStorage.setItem(PLAYER_ID_KEY, id)
}

function adminTokenKey(eventId: string): string {
  return `matchmates_admin_${eventId}`
}

export function getStoredAdminToken(eventId: string): string | null {
  return localStorage.getItem(adminTokenKey(eventId))
}

export function setStoredAdminToken(eventId: string, token: string) {
  localStorage.setItem(adminTokenKey(eventId), token)
}
