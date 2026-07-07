import { supabase } from './supabase'
import { recomputeCareerStatsForMatch } from './careerStats'
import type { DeliveryInput } from './scoringEngine'
import { buildDelivery } from './scoringEngine'

export interface InningsRow {
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

/**
 * Creates a new innings record and sets it as the match's current innings.
 */
export async function createInnings(
  matchId: string,
  inningsNumber: number,
  battingTeamId: string,
  bowlingTeamId: string,
  oversLimit: number,
  target: number | null = null
): Promise<InningsRow> {
  const { data, error } = await supabase
    .from('innings')
    .insert({
      match_id: matchId,
      innings_number: inningsNumber,
      batting_team_id: battingTeamId,
      bowling_team_id: bowlingTeamId,
      status: 'active',
      overs_limit: oversLimit,
      target,
    })
    .select()
    .single()

  if (error) throw error

  // Set as current innings on match + mark match live
  await supabase
    .from('matches')
    .update({ current_innings_id: data.id, status: 'live' })
    .eq('id', matchId)

  return data as InningsRow
}

/**
 * Marks an innings as completed and optionally records target for innings 2.
 */
export async function completeInnings(inningsId: string, totalRuns: number): Promise<void> {
  await supabase.from('innings').update({ status: 'completed' }).eq('id', inningsId)

  // If this was innings 1, the target for innings 2 = totalRuns + 1
  const { data: inn } = await supabase
    .from('innings')
    .select('innings_number, match_id')
    .eq('id', inningsId)
    .single()

  if (inn?.innings_number === 1) {
    // Store target on innings 2 when it's created — nothing to update yet
    // Target is passed as param to createInnings for innings 2
    void totalRuns // will be used by caller
  }
}

/**
 * Loads all deliveries for an innings, ordered chronologically.
 */
export async function loadDeliveries(inningsId: string) {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('innings_id', inningsId)
    .order('over_number', { ascending: true })
    .order('ball_number', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Persists a single delivery and returns the saved row.
 */
export async function saveDelivery(input: DeliveryInput) {
  const row = buildDelivery(input)
  const { data, error } = await supabase.from('deliveries').insert(row).select().single()
  if (error) throw new Error(`saveDelivery failed: ${error.message} | ${error.details} | ${error.hint}`)
  return data
}

/**
 * Deletes the last delivery (undo last ball).
 */
export async function deleteLastDelivery(inningsId: string): Promise<void> {
  const { data } = await supabase
    .from('deliveries')
    .select('id')
    .eq('innings_id', inningsId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.id) {
    await supabase.from('deliveries').delete().eq('id', data.id)
  }
}

/**
 * Loads an innings record by ID.
 */
export async function loadInnings(inningsId: string): Promise<InningsRow | null> {
  const { data } = await supabase
    .from('innings')
    .select('*')
    .eq('id', inningsId)
    .maybeSingle()
  return (data as InningsRow) ?? null
}

/**
 * Loads all innings for a match, ordered by innings number.
 */
export async function loadInningsForMatch(matchId: string): Promise<InningsRow[]> {
  const { data, error } = await supabase
    .from('innings')
    .select('*')
    .eq('match_id', matchId)
    .order('innings_number', { ascending: true })

  if (error) throw error
  return (data as InningsRow[]) ?? []
}

/**
 * Marks match as completed, stores a result summary string, and triggers
 * career stats recomputation for all participants.
 */
export async function completeMatch(matchId: string): Promise<void> {
  // Compute result summary from innings data
  const resultSummary = await computeResultSummary(matchId)

  await supabase
    .from('matches')
    .update({ status: 'completed', result_summary: resultSummary })
    .eq('id', matchId)

  // Fire-and-forget career stats recomputation
  void recomputeCareerStatsForMatch(matchId)
}

async function computeResultSummary(matchId: string): Promise<string> {
  try {
    const { data: innings } = await supabase
      .from('innings')
      .select('id, innings_number, batting_team_id, overs_limit, batting_team:teams!batting_team_id(name)')
      .eq('match_id', matchId)
      .eq('status', 'completed')
      .order('innings_number', { ascending: true })

    if (!innings || innings.length < 2) return ''

    const inn1 = innings[0]
    const inn2 = innings[1]

    // Tally runs and wickets from deliveries for each innings
    async function tally(inningsId: string) {
      const { data: deliveries } = await supabase
        .from('deliveries')
        .select('batter_runs, extra_runs, is_wicket, wicket_type')
        .eq('innings_id', inningsId)

      let runs = 0
      let wickets = 0
      for (const d of deliveries ?? []) {
        runs += (d.batter_runs ?? 0) + (d.extra_runs ?? 0)
        if (d.is_wicket && d.wicket_type !== 'retired_hurt') wickets++
      }
      return { runs, wickets }
    }

    const [t1, t2] = await Promise.all([tally(inn1.id), tally(inn2.id)])

    const team1Name = (inn1.batting_team as { name: string }[])?.[0]?.name ?? 'Team 1'
    const team2Name = (inn2.batting_team as { name: string }[])?.[0]?.name ?? 'Team 2'

    // Count legal balls bowled in innings 2
    const { data: inn2Deliveries } = await supabase
      .from('deliveries')
      .select('is_legal')
      .eq('innings_id', inn2.id)
    const legalBowled = (inn2Deliveries ?? []).filter((d) => d.is_legal).length
    const totalBalls = (inn2.overs_limit ?? 0) * 6
    const ballsToSpare = Math.max(0, totalBalls - legalBowled)

    if (t2.runs > t1.runs) {
      const wicketsLeft = Math.max(0, 10 - t2.wickets)
      const spareStr = ballsToSpare > 0 ? ` & ${ballsToSpare} ball${ballsToSpare !== 1 ? 's' : ''} to spare` : ''
      return `${team2Name} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}${spareStr}`
    } else if (t1.runs > t2.runs) {
      const margin = t1.runs - t2.runs
      return `${team1Name} won by ${margin} run${margin !== 1 ? 's' : ''}`
    } else {
      return 'Match tied'
    }
  } catch {
    return ''
  }
}
