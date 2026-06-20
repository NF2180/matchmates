import { supabase } from './supabase'
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
  if (error) throw error
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
 * Marks match as completed.
 */
export async function completeMatch(matchId: string): Promise<void> {
  await supabase.from('matches').update({ status: 'completed' }).eq('id', matchId)
}
