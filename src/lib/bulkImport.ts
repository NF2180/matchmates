import { supabase } from './supabase'
import type { Player } from '../types'

export interface ParsedName {
  raw: string
  cleaned: string
}

export interface ImportResolution {
  cleaned: string
  outcome: 'created_new' | 'matched_existing' | 'already_in_match' | 'needs_confirmation'
  player?: Player
  existingCandidate?: Player
}

/**
 * Splits pasted text into individual candidate names, one per line.
 * Strips common WhatsApp list prefixes like "1.", "1)", "-", "•".
 */
export function parsePastedNames(text: string): ParsedName[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((raw) => {
      const cleaned = raw
        .replace(/^\d+[.)]\s*/, '') // "1. " or "1) "
        .replace(/^[-•*]\s*/, '') // "- " or "• " or "* "
        .trim()
      return { raw, cleaned }
    })
    .filter((p) => p.cleaned.length > 0)
}

/**
 * Looks up an existing player by case-insensitive exact name match.
 */
export async function findExistingByName(name: string): Promise<Player | null> {
  const { data } = await supabase
    .from('players')
    .select('*')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  return (data as Player) ?? null
}

/**
 * Checks whether a player already has any participation row for a match.
 */
export async function hasParticipation(matchId: string, playerId: string): Promise<boolean> {
  const { data } = await supabase
    .from('participation')
    .select('id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle()

  return !!data
}

/**
 * Creates a brand new player with no mobile number.
 */
export async function createPlayer(name: string): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .insert({ name, mobile_number: null })
    .select()
    .single()

  if (error) throw error
  return data as Player
}

/**
 * Adds a pending participation row for a player in a match.
 */
export async function addPendingParticipation(matchId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('participation').insert({
    match_id: matchId,
    player_id: playerId,
    status: 'pending',
    is_guest: false,
    added_by_organizer: true,
  })
  if (error) throw error
}
