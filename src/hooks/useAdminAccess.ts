import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getStoredAdminToken } from '../lib/identity'

export type AdminAccessState = 'checking' | 'admin' | 'viewer'

/**
 * Checks whether the current device is the organiser for a given match.
 *
 * How it works:
 *   1. Read the admin_token stored in localStorage for this matchId.
 *   2. Fetch the match's admin_token from Supabase.
 *   3. Compare. If they match → 'admin'. Otherwise → 'viewer'.
 *
 * This is NOT cryptographic auth. It prevents accidental edits from
 * other devices and gives the correct UX. A determined bad actor could
 * extract the token from another device's localStorage — acceptable for
 * a friends-group cricket app.
 */
export function useAdminAccess(matchId: string | undefined): AdminAccessState {
  const [state, setState] = useState<AdminAccessState>('checking')

  useEffect(() => {
    if (!matchId) {
      setState('viewer')
      return
    }

    const localToken = getStoredAdminToken(matchId)
    if (!localToken) {
      setState('viewer')
      return
    }

    let cancelled = false

    async function check() {
      const { data, error } = await supabase
        .from('matches')
        .select('admin_token')
        .eq('id', matchId)
        .single()

      if (cancelled) return

      if (error || !data) {
        setState('viewer')
        return
      }

      setState(data.admin_token === localToken ? 'admin' : 'viewer')
    }

    check()
    return () => { cancelled = true }
  }, [matchId])

  return state
}
