import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getStoredAdminToken } from '../lib/identity'

export type AdminAccessState = 'checking' | 'admin' | 'viewer'

// Checks admin access at the EVENT level
export function useAdminAccess(eventId: string | undefined): AdminAccessState {
  const [state, setState] = useState<AdminAccessState>('checking')

  useEffect(() => {
    if (!eventId) { setState('viewer'); return }
    const localToken = getStoredAdminToken(eventId)
    if (!localToken) { setState('viewer'); return }

    let cancelled = false
    supabase.from('events').select('admin_token').eq('id', eventId).single().then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) { setState('viewer'); return }
      setState(data.admin_token === localToken ? 'admin' : 'viewer')
    })
    return () => { cancelled = true }
  }, [eventId])

  return state
}
