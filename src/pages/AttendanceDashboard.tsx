import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Match, Participation } from '../types'

export default function AttendanceDashboard() {
  const { id } = useParams<{ id: string }>()
  const [match, setMatch] = useState<Match | null>(null)
  const [participants, setParticipants] = useState<Participation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showAddGuest, setShowAddGuest] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const loadData = useCallback(async (matchId: string) => {
    setLoading(true)
    setError(null)

    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (matchError) {
      setError(matchError.message)
      setLoading(false)
      return
    }
    setMatch(matchData as Match)

    const { data: participationData } = await supabase
      .from('participation')
      .select('*, player:players(*)')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })

    setParticipants((participationData as Participation[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount/id change
    if (id) loadData(id)
  }, [id, loadData])

  async function addGuest(e: React.FormEvent) {
    e.preventDefault()
    if (!guestName.trim() || !match) return

    setAdding(true)
    try {
      // guest players get a synthetic unique mobile number since the column is unique+required
      const syntheticMobile = `guest_${Date.now()}`
      const { data: guestPlayer, error: playerError } = await supabase
        .from('players')
        .insert({ name: guestName.trim(), mobile_number: syntheticMobile })
        .select()
        .single()
      if (playerError) throw playerError

      const { error: participationError } = await supabase.from('participation').insert({
        match_id: match.id,
        player_id: guestPlayer.id,
        status: 'playing',
        is_guest: true,
        added_by_organizer: true,
        responded_at: new Date().toISOString(),
      })
      if (participationError) throw participationError

      setGuestName('')
      setShowAddGuest(false)
      if (id) loadData(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add guest')
    } finally {
      setAdding(false)
    }
  }

  async function removeParticipant(participationId: string) {
    if (!confirm('Remove this player from the match?')) return
    await supabase.from('participation').delete().eq('id', participationId)
    if (id) loadData(id)
  }

  async function saveEdit(playerId: string) {
    if (!editName.trim()) return
    await supabase.from('players').update({ name: editName.trim() }).eq('id', playerId)
    setEditingId(null)
    if (id) loadData(id)
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  }

  if (error || !match) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error ?? 'Match not found'}</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${match.id}`} className="text-sm text-zinc-500 mb-2 inline-block">
          ← Back to match
        </Link>
        <h1 className="text-xl font-bold text-white">Attendance</h1>
        <p className="text-sm text-zinc-400">{match.match_name}</p>
      </header>

      {!showAddGuest ? (
        <button
          onClick={() => setShowAddGuest(true)}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium rounded-xl py-3 text-sm mb-6"
        >
          + Add Guest Player
        </button>
      ) : (
        <form onSubmit={addGuest} className="flex gap-2 mb-6">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Guest name"
            className="input"
            autoFocus
          />
          <button
            type="submit"
            disabled={adding}
            className="px-4 bg-emerald-500 text-zinc-950 font-semibold rounded-lg text-sm disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddGuest(false)
              setGuestName('')
            }}
            className="px-3 bg-zinc-800 text-zinc-400 rounded-lg text-sm"
          >
            ✕
          </button>
        </form>
      )}

      {error && (
        <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {participants.length === 0 && (
          <div className="text-zinc-600 text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
            No players yet
          </div>
        )}

        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
              {p.player?.name?.[0]?.toUpperCase() ?? '?'}
            </div>

            <div className="flex-1 min-w-0">
              {editingId === p.player_id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input py-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => saveEdit(p.player_id)}
                    className="text-emerald-400 text-sm font-medium shrink-0"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="text-sm text-white truncate">{p.player?.name ?? 'Unknown'}</div>
              )}
              <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
                <StatusDot status={p.status} />
                {p.status === 'playing' ? 'Playing' : p.status === 'not_playing' ? 'Not playing' : 'Pending'}
                {p.is_guest && <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">Guest</span>}
              </div>
            </div>

            <div className="flex gap-1 shrink-0">
              {editingId !== p.player_id && (
                <button
                  onClick={() => {
                    setEditingId(p.player_id)
                    setEditName(p.player?.name ?? '')
                  }}
                  className="text-zinc-500 text-xs px-2 py-1"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => removeParticipant(p.id)}
                className="text-red-400 text-xs px-2 py-1"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-600 mt-6 text-center">
        Duplicate players merge automatically by mobile number when they join.
      </p>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    playing: 'bg-emerald-500',
    not_playing: 'bg-zinc-500',
    pending: 'bg-amber-500',
  }
  return <span className={`w-1.5 h-1.5 rounded-full inline-block ${colors[status] ?? colors.pending}`} />
}
