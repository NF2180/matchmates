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

function adminTokenKey(matchId: string): string {
  return `matchmates_admin_${matchId}`
}

export function getStoredAdminToken(matchId: string): string | null {
  return localStorage.getItem(adminTokenKey(matchId))
}

export function setStoredAdminToken(matchId: string, token: string) {
  localStorage.setItem(adminTokenKey(matchId), token)
}

export function clearStoredAdminToken(matchId: string) {
  localStorage.removeItem(adminTokenKey(matchId))
}
