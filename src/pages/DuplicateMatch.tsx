import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateMatchCode, generateJoinToken, generateAdminToken } from '../lib/matchUtils'
import { getStoredPlayerId, setStoredAdminToken } from '../lib/identity'
import type { Match, Player } from '../types'

const FORMATS = ['T20', 'T10', 'ODI', 'Custom']

interface TeamPlayer {
  key: string
  playerId: string
  name: string
  role: string | null
}

interface TeamState {
  id: string | null       // original team id (for reference)
  name: string
  players: TeamPlayer[]
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

  // Step 2 — teams
  const [teamA, setTeamA] = useState<TeamState>({ id: null, name: 'Team A', players: [] })
  const [teamB, setTeamB] = useState<TeamState>({ id: null, name: 'Team B', players: [] })
  const [bench, setBench] = useState<TeamPlayer[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Player[]>([])
  const [showSearch, setShowSearch] = useState(false)

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
      setMatchDate(new Date().toISOString().split('T')[0])
      setMatchTime(m.match_time ?? '')

      // Load teams and their members from original match
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name')
        .eq('match_id', id)

      if (!teams || teams.length < 2) {
        // No teams yet — fall back to loading participants
        const { data: parts } = await supabase
          .from('participation')
          .select('player_id, player:players(id, name)')
          .eq('match_id', id)
          .eq('status', 'playing')
        const players: TeamPlayer[] = ((parts ?? []) as Array<{ player_id: string; player: Player | Player[] }>)
          .map((p, i) => {
            const pl = Array.isArray(p.player) ? p.player[0] : p.player
            return { key: `p-${i}`, playerId: p.player_id, name: pl?.name ?? 'Unknown', role: null }
          })
        setBench(players)
        setLoading(false)
        return
      }

      // Load members for each team
      async function loadTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
        const { data: members } = await supabase
          .from('team_members')
          .select('role, participation:participation(player_id, player:players(id, name))')
          .eq('team_id', teamId)
        return ((members ?? []) as unknown as Array<{ role: string | null; participation: { player_id: string; player: Player | Player[] } }>)
          .map((m, i) => {
            const pl = Array.isArray(m.participation.player) ? m.participation.player[0] : m.participation.player
            return {
              key: `${teamId}-${i}`,
              playerId: m.participation.player_id,
              name: pl?.name ?? 'Unknown',
              role: m.role,
            }
          })
      }

      const [aPlayers, bPlayers] = await Promise.all([
        loadTeamPlayers(teams[0].id),
        loadTeamPlayers(teams[1].id),
      ])

      setTeamA({ id: teams[0].id, name: teams[0].name, players: aPlayers })
      setTeamB({ id: teams[1].id, name: teams[1].name, players: bPlayers })
      setLoading(false)
    }
    load()
  }, [id])

  // Player search from registry
  useEffect(() => {
    if (!playerSearch.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('players')
        .select('id, name')
        .ilike('name', `%${playerSearch.trim()}%`)
        .limit(8)
      setSearchResults((data as Player[]) ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [playerSearch])

  function addPlayerToTeam(team: 'A' | 'B' | 'bench', player: Player) {
    const entry: TeamPlayer = { key: `add-${Date.now()}`, playerId: player.id, name: player.name, role: null }
    if (team === 'A') setTeamA((t) => ({ ...t, players: [...t.players, entry] }))
    else if (team === 'B') setTeamB((t) => ({ ...t, players: [...t.players, entry] }))
    else setBench((b) => [...b, entry])
    setPlayerSearch('')
    setSearchResults([])
    setShowSearch(false)
  }

  function movePlayer(playerId: string, from: 'A' | 'B' | 'bench', to: 'A' | 'B' | 'bench') {
    const getter = from === 'A' ? teamA.players : from === 'B' ? teamB.players : bench
    const player = getter.find((p) => p.playerId === playerId)
    if (!player) return
    const newEntry = { ...player, key: `mv-${Date.now()}` }
    if (from === 'A') setTeamA((t) => ({ ...t, players: t.players.filter((p) => p.playerId !== playerId) }))
    else if (from === 'B') setTeamB((t) => ({ ...t, players: t.players.filter((p) => p.playerId !== playerId) }))
    else setBench((b) => b.filter((p) => p.playerId !== playerId))
    if (to === 'A') setTeamA((t) => ({ ...t, players: [...t.players, newEntry] }))
    else if (to === 'B') setTeamB((t) => ({ ...t, players: [...t.players, newEntry] }))
    else setBench((b) => [...b, newEntry])
  }

  function removePlayer(playerId: string, from: 'A' | 'B' | 'bench') {
    if (from === 'A') setTeamA((t) => ({ ...t, players: t.players.filter((p) => p.playerId !== playerId) }))
    else if (from === 'B') setTeamB((t) => ({ ...t, players: t.players.filter((p) => p.playerId !== playerId) }))
    else setBench((b) => b.filter((p) => p.playerId !== playerId))
  }

  async function handleCreate() {
    if (!sourceMatch) return
    setError(null)
    setSubmitting(true)

    try {
      const organizerId = getStoredPlayerId() || null
      const adminToken = generateAdminToken()

      // Create match
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

      // Add all players to participation
      const allPlayers = [
        ...teamA.players.map((p) => ({ ...p, team: 'A' as const })),
        ...teamB.players.map((p) => ({ ...p, team: 'B' as const })),
        ...bench.map((p) => ({ ...p, team: null })),
      ]

      const participationMap: Record<string, string> = {} // playerId → participation.id

      for (const p of allPlayers) {
        const { data: part } = await supabase
          .from('participation')
          .insert({
            match_id: newMatch.id,
            player_id: p.playerId,
            status: 'playing',
            is_guest: false,
            added_by_organizer: true,
            responded_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (part) participationMap[p.playerId] = part.id
      }

      // Create teams
      const { data: newTeamA } = await supabase
        .from('teams')
        .insert({ match_id: newMatch.id, name: teamA.name })
        .select().single()
      const { data: newTeamB } = await supabase
        .from('teams')
        .insert({ match_id: newMatch.id, name: teamB.name })
        .select().single()

      if (newTeamA && newTeamB) {
        // Assign team members
        for (const p of teamA.players) {
          const partId = participationMap[p.playerId]
          if (partId) await supabase.from('team_members').upsert(
            { match_id: newMatch.id, participation_id: partId, team_id: newTeamA.id, role: p.role },
            { onConflict: 'match_id,participation_id' }
          )
        }
        for (const p of teamB.players) {
          const partId = participationMap[p.playerId]
          if (partId) await supabase.from('team_members').upsert(
            { match_id: newMatch.id, participation_id: partId, team_id: newTeamB.id, role: p.role },
            { onConflict: 'match_id,participation_id' }
          )
        }
      }

      navigate(`/match/${newMatch.id}/teams`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create match')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (!sourceMatch) return (
    <div className="px-4 py-12 text-center">
      <p className="text-red-400 text-sm mb-3">Match not found</p>
      <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
    </div>
  )

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${sourceMatch.id}`} className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
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
              {s === 1 ? '1 · Match Details' : '2 · Teams'}
            </button>
          ))}
        </div>
      </header>

      {/* Step 1 */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <Field label="Match Name">
            <input type="text" value={matchName} onChange={(e) => setMatchName(e.target.value)} className="input" autoFocus />
          </Field>
          <Field label="Format">
            <div className="flex gap-2 flex-wrap">
              {FORMATS.map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${format === f ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-900 text-zinc-300 border-zinc-700'}`}>
                  {f}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Overs">
            <input type="number" value={overs} onChange={(e) => setOvers(e.target.value)} className="input" min={1} />
          </Field>
          <Field label="Date">
            <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className="input" />
          </Field>
          <Field label="Time">
            <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} className="input" />
          </Field>
          <button onClick={() => setStep(2)} disabled={!matchName.trim()}
            className="w-full bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base mt-2">
            Next: Review Teams →
          </button>
        </div>
      )}

      {/* Step 2 — Teams */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500">Teams copied from previous match. Move players between teams or add from player pool.</p>

          {/* Team A */}
          <TeamSection
            label={teamA.name}
            players={teamA.players}
            onMove={(pid, to) => movePlayer(pid, 'A', to)}
            onRemove={(pid) => removePlayer(pid, 'A')}
            otherTeamLabel={teamB.name}
          />

          {/* Team B */}
          <TeamSection
            label={teamB.name}
            players={teamB.players}
            onMove={(pid, to) => movePlayer(pid, 'B', to)}
            onRemove={(pid) => removePlayer(pid, 'B')}
            otherTeamLabel={teamA.name}
          />

          {/* Bench */}
          {bench.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-500 mb-2">Unassigned ({bench.length})</p>
              {bench.map((p) => (
                <div key={p.key} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-sm text-zinc-300">{p.name}</span>
                  <button onClick={() => movePlayer(p.playerId, 'bench', 'A')} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-800 rounded">→ {teamA.name}</button>
                  <button onClick={() => movePlayer(p.playerId, 'bench', 'B')} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-800 rounded">→ {teamB.name}</button>
                  <button onClick={() => removePlayer(p.playerId, 'bench')} className="text-zinc-600 text-xs">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add from player pool */}
          {showSearch ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search player name…"
                className="input text-sm"
                autoFocus
              />
              {searchResults.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-sm text-white">{p.name}</span>
                  <button onClick={() => addPlayerToTeam('A', p)} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">+ {teamA.name}</button>
                  <button onClick={() => addPlayerToTeam('B', p)} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">+ {teamB.name}</button>
                </div>
              ))}
              <button onClick={() => { setShowSearch(false); setPlayerSearch('') }} className="text-xs text-zinc-500 mt-1">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowSearch(true)}
              className="w-full bg-zinc-800 border border-dashed border-zinc-700 text-zinc-400 rounded-xl py-2.5 text-sm">
              + Add player from pool
            </button>
          )}

          {error && <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">{error}</div>}

          <button onClick={handleCreate} disabled={submitting || (teamA.players.length === 0 && teamB.players.length === 0)}
            className="w-full bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base mt-2">
            {submitting ? 'Creating…' : 'Create Match →'}
          </button>
          <p className="text-xs text-zinc-600 text-center">Goes to Team Setup to confirm toss.</p>
        </div>
      )}
    </div>
  )
}

function TeamSection({ label, players, onMove, onRemove, otherTeamLabel }: {
  label: string
  players: TeamPlayer[]
  onMove: (playerId: string, to: 'A' | 'B' | 'bench') => void
  onRemove: (playerId: string) => void
  otherTeamLabel: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <p className="text-xs font-semibold text-zinc-400 mb-2">{label} ({players.length})</p>
      {players.length === 0 && <p className="text-xs text-zinc-600 py-1">No players</p>}
      {players.map((p) => (
        <div key={p.key} className="flex items-center gap-2 py-1.5">
          <span className="flex-1 text-sm text-white">{p.name}</span>
          <button onClick={() => onMove(p.playerId, label === otherTeamLabel ? 'A' : 'B')}
            className="text-xs text-zinc-500 px-2 py-1 bg-zinc-800 rounded">→ {otherTeamLabel}</button>
          <button onClick={() => onRemove(p.playerId)} className="text-zinc-600 text-xs">✕</button>
        </div>
      ))}
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
