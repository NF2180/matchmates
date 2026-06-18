import { supabase } from './supabase'
import type { Team, TeamMember, PlayerRole } from '../types'

/**
 * Ensures Team A and Team B exist for a match, creating them with default
 * names if they don't already exist. Safe to call multiple times.
 */
export async function ensureTeamsExist(matchId: string): Promise<{ teamA: Team; teamB: Team }> {
  const { data: existing } = await supabase.from('teams').select('*').eq('match_id', matchId)

  let teamA = (existing as Team[] | null)?.find((t) => t.side === 'A') ?? null
  let teamB = (existing as Team[] | null)?.find((t) => t.side === 'B') ?? null

  if (!teamA) {
    const { data, error } = await supabase
      .from('teams')
      .insert({ match_id: matchId, name: 'Team A', side: 'A' })
      .select()
      .single()
    if (error) throw error
    teamA = data as Team
  }

  if (!teamB) {
    const { data, error } = await supabase
      .from('teams')
      .insert({ match_id: matchId, name: 'Team B', side: 'B' })
      .select()
      .single()
    if (error) throw error
    teamB = data as Team
  }

  return { teamA, teamB }
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) throw error
}

export async function loadTeamMembers(matchId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*, participation:participation(*, player:players(*))')
    .eq('match_id', matchId)

  if (error) throw error
  return (data as TeamMember[]) ?? []
}

/**
 * Assigns a participant to a team (or bench, if teamId is null).
 * Upserts so calling this repeatedly just moves the player around.
 */
export async function assignToTeam(
  matchId: string,
  participationId: string,
  teamId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .upsert(
      { match_id: matchId, participation_id: participationId, team_id: teamId },
      { onConflict: 'match_id,participation_id' }
    )
  if (error) throw error
}

/**
 * Sets or clears a player's role. Does NOT enforce one-role-per-team at
 * the database level — the calling UI is responsible for warning if a
 * role is already taken by someone else on the same team.
 */
export async function setPlayerRole(
  matchId: string,
  participationId: string,
  teamId: string | null,
  role: PlayerRole | null
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .upsert(
      { match_id: matchId, participation_id: participationId, team_id: teamId, role },
      { onConflict: 'match_id,participation_id' }
    )
  if (error) throw error
}

export async function setBattingFirstTeam(matchId: string, teamId: string | null): Promise<void> {
  const { error } = await supabase.from('matches').update({ batting_first_team_id: teamId }).eq('id', matchId)
  if (error) throw error
}
