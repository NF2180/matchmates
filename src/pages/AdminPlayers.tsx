import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Player } from '../types'
import MergePlayersTool from '../components/MergePlayersTool'

export default function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadPlayers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      setPlayers((data as Player[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount
    loadPlayers()
  }, [loadPlayers])

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditMobile(p.mobile_number ?? '')
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  async function saveEdit(playerId: string) {
    setSaveError(null)

    const trimmedMobile = editMobile.trim()
    if (trimmedMobile && !/^[0-9]{10}$/.test(trimmedMobile)) {
      setSaveError('Mobile number must be exactly 10 digits, or leave it blank')
      return
    }
    if (!editName.trim()) {
      setSaveError('Name cannot be empty')
      return
    }

    setSaving(true)
    try {
      // if setting a mobile number, check it doesn't collide with another player
      if (trimmedMobile) {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('mobile_number', trimmedMobile)
          .neq('id', playerId)
          .maybeSingle()

        if (existing) {
          setSaveError('Another player already has this mobile number')
          setSaving(false)
          return
        }
      }

      const { error: updateError } = await supabase
        .from('players')
        .update({
          name: editName.trim(),
          mobile_number: trimmedMobile || null,
        })
        .eq('id', playerId)

      if (updateError) throw updateError

      setEditingId(null)
      await loadPlayers()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const filtered = players.filter((p) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.mobile_number ?? '').includes(q)
  })

  const missingMobileCount = players.filter((p) => !p.mobile_number && !isGuestMobile(p.mobile_number)).length

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to="/" className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">Admin · Players</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage player profiles and mobile numbers
        </p>
        {missingMobileCount > 0 && (
          <p className="text-xs text-amber-400 mt-2">
            {missingMobileCount} player{missingMobileCount !== 1 ? 's' : ''} without a mobile number
          </p>
        )}
      </header>

      <div className="flex flex-col gap-2 mb-5">
        <MergePlayersTool players={players} onMerged={loadPlayers} />
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or number"
        className="input mb-4"
      />

      {loading && <div className="text-zinc-500 text-sm py-8 text-center">Loading players…</div>}

      {error && (
        <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-zinc-600 text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
          No players found
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            {editingId === p.id ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Name"
                  className="input py-2 text-sm"
                  autoFocus
                />
                <input
                  type="tel"
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Mobile number (optional)"
                  className="input py-2 text-sm"
                />
                {saveError && <div className="text-red-400 text-xs">{saveError}</div>}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => saveEdit(p.id)}
                    disabled={saving}
                    className="flex-1 bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="px-4 bg-zinc-800 text-zinc-400 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
                  {p.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/player/${p.id}`} className="text-sm text-white truncate active:text-emerald-400">
                    {p.name}
                  </Link>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {isGuestMobile(p.mobile_number) ? (
                      <span className="text-zinc-600">Guest player</span>
                    ) : p.mobile_number ? (
                      p.mobile_number
                    ) : (
                      <span className="text-amber-500">No mobile number</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="text-emerald-400 text-xs px-2 py-1 shrink-0"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function isGuestMobile(mobile: string | null): boolean {
  return !!mobile && mobile.startsWith('guest_')
}
