import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cleanPlayerName } from '../lib/matchUtils'
import type { Participation, Player } from '../types'

export default function AttendanceDashboard() {
  const { id } = useParams<{ id: string }>() // event id
  const [participants, setParticipants] = useState<Participation[]>([])
  const [loading, setLoading] = useState(true)
  const [playerSearch, setPlayerSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Player[]>([])
  const [bulkText, setBulkText] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (id) loadParticipants() }, [id])

  async function loadParticipants() {
    const { data } = await supabase.from('participation').select('*, player:players(*)').eq('event_id', id).order('created_at')
    setParticipants((data as Participation[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!playerSearch.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('players').select('id, name').ilike('name', `%${playerSearch.trim()}%`).limit(8)
      setSearchResults((data as Player[]) ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [playerSearch])

  async function addPlayer(name: string, existingId?: string) {
    if (!id || !name.trim()) return
    setAdding(true)
    try {
      let playerId = existingId
      if (!playerId) {
        const { data: existing } = await supabase.from('players').select('id').ilike('name', name.trim()).limit(1)
        if (existing && existing.length > 0) {
          playerId = existing[0].id
        } else {
          const { data: newP } = await supabase.from('players').insert({ name: name.trim(), mobile_number: null }).select().single()
          playerId = newP?.id
        }
      }
      if (!playerId) return
      const already = participants.find((p) => p.player_id === playerId)
      if (already) { setError(`${name} is already in this event`); return }
      await supabase.from('participation').insert({
        event_id: id, player_id: playerId, status: 'playing',
        is_guest: false, added_by_organizer: true, responded_at: new Date().toISOString(),
      })
      setPlayerSearch('')
      setSearchResults([])
      await loadParticipants()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player')
    } finally {
      setAdding(false)
    }
  }

  async function addFromBulk() {
    if (!bulkText.trim() || !id) return
    setAdding(true)
    const names = bulkText.split('\n').map(cleanPlayerName).filter(Boolean)
    for (const name of names) await addPlayer(name)
    setBulkText('')
    setAdding(false)
  }

  async function removeParticipant(partId: string) {
    await supabase.from('participation').delete().eq('id', partId)
    setParticipants((prev) => prev.filter((p) => p.id !== partId))
  }

  async function toggleStatus(partId: string, current: string) {
    const next = current === 'playing' ? 'not_playing' : 'playing'
    await supabase.from('participation').update({ status: next }).eq('id', partId)
    setParticipants((prev) => prev.map((p) => p.id === partId ? { ...p, status: next as any } : p))
  }

  const playing = participants.filter((p) => p.status === 'playing')
  const notPlaying = participants.filter((p) => p.status !== 'playing')

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/event/${id}`} className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">Attendance</h1>
      </header>

      {/* Search */}
      <div className="relative mb-2">
        <input type="text" value={playerSearch} onChange={(e) => { setPlayerSearch(e.target.value); setError(null) }}
          placeholder="Search & add player…" className="input text-sm" />
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl mt-1 z-10 overflow-hidden">
            {searchResults.map((p) => (
              <button key={p.id} onClick={() => addPlayer(p.name, p.id)}
                className="w-full text-left px-3 py-2.5 text-sm text-white active:bg-zinc-700">
                {p.name}
              </button>
            ))}
            {!searchResults.find((p) => p.name.toLowerCase() === playerSearch.toLowerCase()) && (
              <button onClick={() => addPlayer(playerSearch)}
                className="w-full text-left px-3 py-2.5 text-sm text-emerald-400 active:bg-zinc-700">
                + Add "{playerSearch}" as new player
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk paste */}
      <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)}
        placeholder="Paste list (one per line)" className="input text-sm h-20 resize-none mb-2" />
      {bulkText.trim() && (
        <button onClick={addFromBulk} disabled={adding} className="w-full bg-zinc-800 text-zinc-300 rounded-lg py-2 text-sm mb-4">
          {adding ? 'Adding…' : `Add ${bulkText.split('\n').filter((l) => cleanPlayerName(l)).length} players`}
        </button>
      )}

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {/* Playing */}
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Playing ({playing.length})</h2>
      <div className="flex flex-col gap-1.5 mb-4">
        {playing.map((p) => (
          <div key={p.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-sm text-white">{p.player?.name}</span>
            <div className="flex gap-3">
              <button onClick={() => toggleStatus(p.id, p.status)} className="text-xs text-zinc-500">Not playing</button>
              <button onClick={() => removeParticipant(p.id)} className="text-xs text-red-400">Remove</button>
            </div>
          </div>
        ))}
      </div>

      {notPlaying.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Not Playing ({notPlaying.length})</h2>
          <div className="flex flex-col gap-1.5">
            {notPlaying.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 opacity-60">
                <span className="text-sm text-white">{p.player?.name}</span>
                <button onClick={() => toggleStatus(p.id, p.status)} className="text-xs text-emerald-400">Mark playing</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
