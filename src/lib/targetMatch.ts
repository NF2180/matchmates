import { supabase } from './supabase'
import type { Match } from '../types'

/**
 * Resolves the "target" match for admin bulk actions that aren't tied to
 * a specific match page (e.g. pasting a WhatsApp participant list).
 *
 * Preference order:
 *   1. The soonest upcoming match (date >= today), status created or live
 *   2. If none upcoming, the most recent past match
 *   3. null if there are no matches at all
 */
export async function getTargetMatch(): Promise<Match | null> {
  const today = new Date().toISOString().split('T')[0]

  const { data: upcoming } = await supabase
    .from('matches')
    .select('*, ground:grounds(*)')
    .gte('match_date', today)
    .in('status', ['created', 'live'])
    .order('match_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (upcoming) return upcoming as Match

  const { data: past } = await supabase
    .from('matches')
    .select('*, ground:grounds(*)')
    .order('match_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (past as Match) ?? null
}
