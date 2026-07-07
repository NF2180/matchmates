import { supabase } from './supabase'

export interface MergeResult {
  movedParticipations: number
  skippedParticipations: number
}

export async function mergePlayers(canonicalId: string, duplicateId: string): Promise<MergeResult> {
  if (canonicalId === duplicateId) throw new Error('Cannot merge a player into themselves')

  const { data: dupParticipations, error: fetchError } = await supabase
    .from('participation').select('id, event_id').eq('player_id', duplicateId)
  if (fetchError) throw fetchError

  let moved = 0, skipped = 0

  for (const row of dupParticipations ?? []) {
    const { data: existingRows } = await supabase
      .from('participation').select('id').eq('event_id', row.event_id).eq('player_id', canonicalId).limit(1)
    if (existingRows?.[0]) {
      await supabase.from('team_members').delete().eq('participation_id', row.id)
      await supabase.from('participation').delete().eq('id', row.id)
      skipped++
    } else {
      await supabase.from('participation').update({ player_id: canonicalId }).eq('id', row.id)
      moved++
    }
  }

  const { data: remaining } = await supabase.from('participation').select('id').eq('player_id', duplicateId)
  for (const row of remaining ?? []) {
    await supabase.from('team_members').delete().eq('participation_id', row.id)
    await supabase.from('participation').delete().eq('id', row.id)
  }

  await supabase.from('players').delete().eq('id', duplicateId)
  return { movedParticipations: moved, skippedParticipations: skipped }
}
