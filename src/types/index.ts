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
  admin_token: string | null
  match_name: string
  sport: string
  format: string | null
  overs: number | null
  ground_id: string | null
  organizer_id: string | null
  match_date: string
  match_time: string | null
  status: MatchStatus
  batting_first_team_id: string | null
  current_innings_id: string | null
  result_summary: string | null
  created_at: string
  // joined data
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

export type TeamSide = 'A' | 'B'

export interface Team {
  id: string
  match_id: string
  name: string
  side: TeamSide
  created_at: string
}

export type PlayerRole = 'captain' | 'vice_captain' | 'wicket_keeper' | 'substitute'

export interface TeamMember {
  id: string
  match_id: string
  participation_id: string
  team_id: string | null
  role: PlayerRole | null
  created_at: string
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
export type WicketType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket'
  | 'retired_hurt'

export interface DeliveryRecord {
  id: string
  match_id: string
  innings_id: string
  innings_number: number
  over_number: number
  ball_number: number
  is_legal: boolean
  striker_id: string
  non_striker_id: string
  bowler_id: string
  batter_runs: number
  extra_runs: number
  total_runs: number
  extra_type: ExtraType | null
  is_free_hit: boolean
  is_wicket: boolean
  wicket_type: WicketType | null
  dismissed_player_id: string | null
  fielder_id: string | null
  created_at: string
}
