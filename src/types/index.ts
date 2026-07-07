export interface Ground {
  id: string
  name: string
  created_at: string
}

export interface Player {
  id: string
  name: string
  mobile_number: string | null
  created_at: string
}

export type EventStatus = 'created' | 'live' | 'completed' | 'cancelled'
export type MatchStatus = 'created' | 'live' | 'completed' | 'cancelled'
export type ParticipationStatus = 'pending' | 'playing' | 'not_playing'
export type PlayerRole = 'captain' | 'vice_captain' | 'wicket_keeper' | 'substitute'

export interface Event {
  id: string
  event_code: string
  join_token: string
  admin_token: string | null
  event_name: string
  event_date: string
  event_time: string | null
  ground_id: string | null
  organizer_id: string | null
  status: EventStatus
  created_at: string
  ground?: Ground | null
}

export interface Participation {
  id: string
  event_id: string
  player_id: string
  status: ParticipationStatus
  is_guest: boolean
  added_by_organizer: boolean
  responded_at: string | null
  created_at: string
  player?: Player
}

export interface Match {
  id: string
  event_id: string
  game_number: number
  match_name: string
  sport: string
  format: string | null
  overs: number | null
  status: MatchStatus
  batting_first_team_id: string | null
  current_innings_id: string | null
  result_summary: string | null
  created_at: string
}

export interface Team {
  id: string
  match_id: string
  name: string
  created_at: string
}

export interface TeamMember {
  id: string
  match_id: string
  participation_id: string
  team_id: string | null
  role: PlayerRole | null
  participation?: Participation
}

export interface Innings {
  id: string
  match_id: string
  innings_number: number
  batting_team_id: string
  bowling_team_id: string
  status: 'active' | 'completed'
  target: number | null
  overs_limit: number
  created_at: string
}

export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'overthrow'
export type WicketType = 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket' | 'retired_hurt'
