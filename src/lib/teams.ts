import { supabase } from './supabase'
import type { Team, TeamMember } from '../types'

export async function ensureTeamsExist(matchId: string): Promise<{ teamA: Team; teamB: Team }> {
  const { data: existing } = await supabase.from('teams').select('*').eq('match_id', matchId)
  if (existing && existing.length >= 2) {
    const a = existing.find((t: any) => t.name === 'Team A') ?? existing[0]
    const b = existing.find((t: any) => t.name === 'Team B') ?? existing[1]
    return { teamA: a as Team, teamB: b as Team }
  }
  const { data: a } = await supabase.from('teams').insert({ match_id: matchId, name: 'Team A' }).select().single()
  const { data: b } = await supabase.from('teams').insert({ match_id: matchId, name: 'Team B' }).select().single()
  return { teamA: a as Team, teamB: b as Team }
}

export async function loadTeamMembers(matchId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*, participation:participation(*, player:players(*))')
    .eq('match_id', matchId)
  if (error) throw error
  return (data as TeamMember[]) ?? []
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  await supabase.from('teams').update({ name }).eq('id', teamId)
}

export async function assignToTeam(matchId: string, participationId: string, teamId: string | null): Promise<void> {
  const { error } = await supabase.from('team_members').upsert(
    { match_id: matchId, participation_id: participationId, team_id: teamId },
    { onConflict: 'match_id,participation_id' }
  )
  if (error) throw error
}

export async function setPlayerRole(matchId: string, participationId: string, teamId: string, role: string | null): Promise<void> {
  await supabase.from('team_members').upsert(
    { match_id: matchId, participation_id: participationId, team_id: teamId, role },
    { onConflict: 'match_id,participation_id' }
  )
}

export async function setBattingFirstTeam(matchId: string, teamId: string): Promise<void> {
  await supabase.from('matches').update({ batting_first_team_id: teamId }).eq('id', matchId)
}
