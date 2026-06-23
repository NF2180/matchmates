import { supabase } from './supabase'

export interface MergeResult {
  movedParticipations: number
  skippedParticipations: number
}

/**
 * Merges `duplicateId` into `canonicalId`:
 *   - team_members rows for the duplicate are cleaned up first
 *   - participation rows are moved to the canonical player, or deleted
 *     if the canonical already has one for the same match
 *   - the duplicate player record is then deleted
 */
export async function mergePlayers(canonicalId: string, duplicateId: string): Promise<MergeResult> {
  if (canonicalId === duplicateId) {
    throw new Error('Cannot merge a player into themselves')
  }

  const { data: dupParticipations, error: fetchError } = await supabase
    .from('participation')
    .select('id, match_id')
    .eq('player_id', duplicateId)

  if (fetchError) throw fetchError

  let moved = 0
  let skipped = 0

  for (const row of dupParticipations ?? []) {
    const { data: existingRows } = await supabase
      .from('participation')
      .select('id')
      .eq('match_id', row.match_id)
      .eq('player_id', canonicalId)
      .limit(1)

    if (existingRows?.[0]) {
      // Canonical already has this match — clean up team_members then delete duplicate participation
      await supabase.from('team_members').delete().eq('participation_id', row.id)
      await supabase.from('participation').delete().eq('id', row.id)
      skipped++
    } else {
      // Move to canonical player
      await supabase.from('participation').update({ player_id: canonicalId }).eq('id', row.id)
      moved++
    }
  }

  // Safety: clean up any remaining participation/team_members for the duplicate
  const { data: remaining } = await supabase
    .from('participation').select('id').eq('player_id', duplicateId)
  for (const row of remaining ?? []) {
    await supabase.from('team_members').delete().eq('participation_id', row.id)
    await supabase.from('participation').delete().eq('id', row.id)
  }

  const { error: deleteError } = await supabase.from('players').delete().eq('id', duplicateId)
  if (deleteError) throw deleteError

  return { movedParticipations: moved, skippedParticipations: skipped }
}
