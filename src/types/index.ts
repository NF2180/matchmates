export interface Ground {
  id: string
  name: string
  address: string | null
  city: string | null
  created_at: string
}

export interface Player {
  id: string
  name: string
  mobile_number: string | null
  photo_url: string | null
  created_at: string
}

export type MatchStatus = 'created' | 'live' | 'completed' | 'cancelled'

export interface Match {
  id: string
  match_code: string
  join_token: string
  match_name: string
  sport: string
  format: string | null
  overs: number | null
  ground_id: string | null
  organizer_id: string | null
  match_date: string
  match_time: string | null
  status: MatchStatus
  created_at: string
  // joined data (populated client-side via select)
  ground?: Ground | null
}

export type ParticipationStatus = 'pending' | 'playing' | 'not_playing'

export interface Participation {
  id: string
  match_id: string
  player_id: string
  status: ParticipationStatus
  is_guest: boolean
  added_by_organizer: boolean
  responded_at: string | null
  created_at: string
  player?: Player
}
