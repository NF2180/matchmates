import { supabase } from './supabase'

export interface MergeResult {
  movedParticipations: number
  skippedParticipations: number
}

/**
 * Merges `duplicateId` into `canonicalId`:
 *   - Any participation rows belonging to the duplicate are re-pointed to
 *     the canonical player, UNLESS the canonical player already has a
 *     participation row for that same match (unique constraint), in which
 *     case that duplicate row is simply deleted instead (we keep whichever
 *     status the canonical player already has for that match).
 *   - The duplicate player record itself is deleted once empty.
 *
 * The canonical player's name/mobile are left untouched; admin can edit
 * those separately if needed.
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
    const { data: existing } = await supabase
      .from('participation')
      .select('id')
      .eq('match_id', row.match_id)
      .eq('player_id', canonicalId)
      .maybeSingle()

    if (existing) {
      // canonical player already has a row for this match - drop the duplicate's row
      await supabase.from('participation').delete().eq('id', row.id)
      skipped++
    } else {
      await supabase.from('participation').update({ player_id: canonicalId }).eq('id', row.id)
      moved++
    }
  }

  const { error: deleteError } = await supabase.from('players').delete().eq('id', duplicateId)
  if (deleteError) throw deleteError

  return { movedParticipations: moved, skippedParticipations: skipped }
}
