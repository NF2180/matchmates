import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateMatchCode, generateJoinToken, generateAdminToken } from '../lib/matchUtils'
import { getStoredPlayerId, setStoredAdminToken } from '../lib/identity'
import type { Match, Player } from '../types'

const FORMATS = ['T20', 'T10', 'ODI', 'Custom']

interface PlayerEntry {
  key: string          // temp key for React list
  playerId: string | null  // null = new player to be created
  name: string
  isNew: boolean
}

export default function DuplicateMatch() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [sourceMatch, setSourceMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<1 | 2>(1)

  // Step 1 — match details
  const [matchName, setMatchName] = useState('')
  const [format, setFormat] = useState('T20')
  const [overs, setOvers] = useState('20')
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')

  // Step 2 — player list
  const [players, setPlayers] = useState<PlayerEntry[]>([])
  const [newPlayerName, setNewPlayerName] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      const { data, error } = await supabase
        .from('matches')
        .select('*, ground:grounds(*)')
        .eq('id', id)
        .single()
      if (error || !data) { setLoading(false); return }

      const m = data as Match
      setSourceMatch(m)
      setMatchName(`${m.match_name} (2)`)
      setFormat(m.format ?? 'T20')
      setOvers(String(m.overs ?? 20))
      setMatchDate(m.match_date)
      setMatchTime(m.match_time ?? '')

      // Load players from the original match (playing status only)
      const { data: parts } = await supabase
        .from('participation')
        .select('player_id, player:players(id, name)')
        .eq('match_id', id)
        .eq('status', 'playing')
        .order('created_at', { ascending: true })

      const entries: PlayerEntry[] = ((parts ?? []) as Array<{
        player_id: string
        player: Player[] | Player
      }>).map((p, i) => {
        const playerData = Array.isArray(p.player) ? p.player[0] : p.player
        return {
          key: `orig-${i}`,
          playerId: p.player_id,
          name: playerData?.name ?? 'Unknown',
          isNew: false,
        }
      })
      setPlayers(entries)
      setLoading(false)
    }
    load()
  }, [id])

  function removePlayer(key: string) {
    setPlayers((prev) => prev.filter((p) => p.key !== key))
  }

  function updateName(key: string, name: string) {
    setPlayers((prev) => prev.map((p) => p.key === key ? { ...p, name } : p))
  }

  function addNewPlayer() {
    if (!newPlayerName.trim()) return
    setPlayers((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        playerId: null,
        name: newPlayerName.trim(),
        isNew: true,
      },
    ])
    setNewPlayerName('')
    setAddingNew(false)
  }

  async function handleCreate() {
    if (!sourceMatch) return
    setError(null)
    setSubmitting(true)

    try {
      const organizerId = getStoredPlayerId()
      const adminToken = generateAdminToken()

      // Create the new match
      const { data: newMatch, error: matchError } = await supabase
        .from('matches')
        .insert({
          match_code: generateMatchCode(),
          join_token: generateJoinToken(),
          admin_token: adminToken,
          match_name: matchName.trim(),
          sport: sourceMatch.sport,
          format,
          overs: overs ? parseInt(overs, 10) : null,
          ground_id: sourceMatch.ground_id,
          organizer_id: organizerId,
          match_date: matchDate,
          match_time: matchTime || null,
          status: 'created',
        })
        .select()
        .single()

      if (matchError) throw matchError

      setStoredAdminToken(newMatch.id, adminToken)

      // Add all players to the new match as 'playing'
      for (const entry of players) {
        if (!entry.name.trim()) continue

        let playerId = entry.playerId

        // Create new player in registry if needed
        if (entry.isNew || !playerId) {
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({ name: entry.name.trim(), mobile_number: null })
            .select()
            .single()
          if (playerError) continue
          playerId = newPlayer.id
        } else if (entry.name !== players.find((p) => p.key === entry.key)?.name) {
          // Name was edited — update the registry player's name
          await supabase.from('players').update({ name: entry.name.trim() }).eq('id', playerId)
        }

        await supabase.from('participation').insert({
          match_id: newMatch.id,
          player_id: playerId,
          status: 'playing',
          is_guest: entry.isNew,
          added_by_organizer: true,
          responded_at: new Date().toISOString(),
        })
      }

      navigate(`/match/${newMatch.id}/teams`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create match')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  }

  if (!sourceMatch) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">Match not found</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${sourceMatch.id}`} className="text-sm text-zinc-500 mb-2 inline-block">
          ← Back to match
        </Link>
        <h1 className="text-xl font-bold text-white">New Match</h1>
        <div className="flex gap-2 mt-3">
          {([1, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => step > s && setStep(s)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${
                step === s
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                  : step > s
                    ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}
            >
              {s === 1 ? '1 · Match Details' : '2 · Players'}
            </button>
          ))}
        </div>
      </header>

      {/* Step 1 — match details */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <Field label="Match Name">
            <input
              type="text"
              value={matchName}
              onChange={(e) => setMatchName(e.target.value)}
              className="input"
              autoFocus
            />
          </Field>

          <Field label="Format">
            <div className="flex gap-2 flex-wrap">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                    format === f
                      ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Overs">
            <input
              type="number"
              value={overs}
              onChange={(e) => setOvers(e.target.value)}
              className="input"
              min={1}
            />
          </Field>

          <Field label="Ground (locked from original)">
            <div className="input bg-zinc-800/50 text-zinc-500 cursor-not-allowed">
              {sourceMatch.ground?.name ?? 'No ground set'}
            </div>
          </Field>

          <Field label="Date">
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Time">
            <input
              type="time"
              value={matchTime}
              onChange={(e) => setMatchTime(e.target.value)}
              className="input"
            />
          </Field>

          <button
            onClick={() => setStep(2)}
            disabled={!matchName.trim()}
            className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base mt-2"
          >
            Next: Review Players →
          </button>
        </div>
      )}

      {/* Step 2 — player list */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-400">
            {players.length} player{players.length !== 1 ? 's' : ''} copied from the original match.
            Edit names, remove players, or add new ones before creating.
          </p>

          <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto">
            {players.map((p) => (
              <div key={p.key} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updateName(p.key, e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white outline-none border-b border-zinc-700 focus:border-emerald-500 py-0.5"
                />
                {p.isNew && (
                  <span className="text-xs text-emerald-400 shrink-0">New</span>
                )}
                <button
                  onClick={() => removePlayer(p.key)}
                  className="text-zinc-500 text-xs px-1 shrink-0 active:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {!addingNew ? (
            <button
              onClick={() => setAddingNew(true)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm"
            >
              + Add Player
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNewPlayer()}
                placeholder="Player name"
                className="input flex-1"
                autoFocus
              />
              <button
                onClick={addNewPlayer}
                disabled={!newPlayerName.trim()}
                className="px-4 bg-emerald-500 text-zinc-950 font-semibold rounded-lg text-sm disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingNew(false); setNewPlayerName('') }}
                className="px-3 bg-zinc-800 text-zinc-400 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={submitting || players.length === 0}
            className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base mt-2"
          >
            {submitting ? 'Creating…' : `Create Match with ${players.length} Players`}
          </button>

          <p className="text-xs text-zinc-600 text-center">
            You'll go directly to Team Setup after creation.
          </p>
        </div>
      )}
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
