import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateCode, generateJoinToken, generateAdminToken, cleanPlayerName } from '../lib/matchUtils'
import { getStoredPlayerId, setStoredAdminToken } from '../lib/identity'
import type { Ground, Player } from '../types'

export default function CreateEvent() {
  const navigate = useNavigate()
  const [grounds, setGrounds] = useState<Ground[]>([])
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split('T')[0])
  const [eventTime, setEventTime] = useState('')
  const [groundId, setGroundId] = useState('')
  const [newGroundName, setNewGroundName] = useState('')
  const [showNewGround, setShowNewGround] = useState(false)

  // Player roster
  const [bulkText, setBulkText] = useState('')
  const [players, setPlayers] = useState<{ name: string; id?: string }[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Player[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('grounds').select('*').order('name').then(({ data }) => {
      if (data) setGrounds(data as Ground[])
    })
  }, [])

  useEffect(() => {
    if (!playerSearch.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('players').select('id, name').ilike('name', `%${playerSearch.trim()}%`).limit(8)
      setSearchResults((data as Player[]) ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [playerSearch])

  function addFromBulk() {
    const lines = bulkText.split('\n').map((l) => cleanPlayerName(l)).filter(Boolean)
    const existing = new Set(players.map((p) => p.name.toLowerCase()))
    const newOnes = lines.filter((n) => !existing.has(n.toLowerCase())).map((name) => ({ name }))
    setPlayers((prev) => [...prev, ...newOnes])
    setBulkText('')
  }

  function addFromSearch(p: Player) {
    if (!players.find((x) => x.name.toLowerCase() === p.name.toLowerCase())) {
      setPlayers((prev) => [...prev, { name: p.name, id: p.id }])
    }
    setPlayerSearch('')
    setSearchResults([])
  }

  function removePlayer(index: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!eventName.trim()) { setError('Event name required'); return }
    setError(null)
    setSubmitting(true)
    try {
      let finalGroundId = groundId || null
      if (showNewGround && newGroundName.trim()) {
        const { data } = await supabase.from('grounds').insert({ name: newGroundName.trim() }).select().single()
        finalGroundId = data?.id ?? null
      }

      const adminToken = generateAdminToken()
      const organizerId = getStoredPlayerId() || null

      const { data: event, error: eventError } = await supabase.from('events').insert({
        event_code: generateCode(),
        join_token: generateJoinToken(),
        admin_token: adminToken,
        event_name: eventName.trim(),
        event_date: eventDate,
        event_time: eventTime || null,
        ground_id: finalGroundId,
        organizer_id: organizerId,
        status: 'created',
      }).select().single()
      if (eventError) throw eventError

      setStoredAdminToken(event.id, adminToken)

      // Add players to participation
      for (const p of players) {
        let playerId = p.id
        if (!playerId) {
          const { data: existing } = await supabase.from('players').select('id').ilike('name', p.name).limit(1)
          if (existing && existing.length > 0) {
            playerId = existing[0].id
          } else {
            const { data: newPlayer } = await supabase.from('players').insert({ name: p.name, mobile_number: null }).select().single()
            playerId = newPlayer?.id
          }
        }
        if (playerId) {
          await supabase.from('participation').insert({
            event_id: event.id,
            player_id: playerId,
            status: 'playing',
            is_guest: false,
            added_by_organizer: true,
            responded_at: new Date().toISOString(),
          }).select()
        }
      }

      navigate(`/event/${event.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <button onClick={() => navigate('/')} className="text-sm text-zinc-500 mb-2 block">← Back</button>
        <h1 className="text-xl font-bold text-white">New Match Day</h1>
      </header>

      <div className="flex flex-col gap-5">
        <Field label="Event Name">
          <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Sunday Cricket" className="input" autoFocus />
        </Field>

        <Field label="Date">
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="input" />
        </Field>

        <Field label="Time (optional)">
          <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="input" />
        </Field>

        <Field label="Ground (optional)">
          {!showNewGround ? (
            <div className="flex flex-col gap-2">
              <select value={groundId} onChange={(e) => setGroundId(e.target.value)} className="input">
                <option value="">Select ground</option>
                {grounds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewGround(true)} className="text-sm text-emerald-400 text-left">+ Add new ground</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input type="text" value={newGroundName} onChange={(e) => setNewGroundName(e.target.value)} placeholder="Ground name" className="input" />
              <button type="button" onClick={() => { setShowNewGround(false); setNewGroundName('') }} className="text-sm text-zinc-400 text-left">Use existing instead</button>
            </div>
          )}
        </Field>

        {/* Players */}
        <div>
          <label className="text-sm font-medium text-zinc-400 block mb-2">Players ({players.length})</label>

          {/* Search from registry */}
          <div className="relative mb-2">
            <input
              type="text"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search existing players…"
              className="input text-sm"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl mt-1 z-10 overflow-hidden">
                {searchResults.map((p) => (
                  <button key={p.id} onClick={() => addFromSearch(p)} className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-zinc-700 active:bg-zinc-700">
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bulk paste */}
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Or paste list (one per line)&#10;1. Nitin&#10;2. Venky"
            className="input text-sm h-24 resize-none mb-2"
          />
          {bulkText.trim() && (
            <button onClick={addFromBulk} className="w-full bg-zinc-800 text-zinc-300 rounded-lg py-2 text-sm mb-3">
              Add {bulkText.split('\n').filter((l) => cleanPlayerName(l)).length} players
            </button>
          )}

          {/* Player list */}
          {players.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              {players.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                  <span className="text-sm text-white">{p.name}</span>
                  <button onClick={() => removePlayer(i)} className="text-zinc-500 text-xs">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">{error}</div>}

        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base">
          {submitting ? 'Creating…' : 'Create Match Day'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  )
}
