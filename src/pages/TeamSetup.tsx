import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdminAccess } from '../hooks/useAdminAccess'
import { ensureTeamsExist, loadTeamMembers, renameTeam, assignToTeam, setPlayerRole, setBattingFirstTeam } from '../lib/teams'
import { cleanPlayerName } from '../lib/matchUtils'
import type { Match, Participation, Team, TeamMember, PlayerRole, Player } from '../types'

const ROLE_LABELS: Record<string, string> = {
  captain: 'C', vice_captain: 'VC', wicket_keeper: 'WK', substitute: 'Sub',
}

export default function TeamSetup() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [match, setMatch] = useState<Match | null>(null)
  const [eventId, setEventId] = useState<string | undefined>()
  const adminState = useAdminAccess(eventId)

  const [participants, setParticipants] = useState<Participation[]>([])
  const [teamA, setTeamA] = useState<Team | null>(null)
  const [teamB, setTeamB] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  const [editingTeamName, setEditingTeamName] = useState<string | null>(null)
  const [teamNameInput, setTeamNameInput] = useState('')
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null)
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Player[]>([])
  const [addingPlayerError, setAddingPlayerError] = useState<string | null>(null)

  const loadAll = useCallback(async (matchId: string) => {
    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (!m) return
    setMatch(m as Match)
    setEventId(m.event_id)

    const { teamA: a, teamB: b } = await ensureTeamsExist(matchId)
    setTeamA(a); setTeamB(b)

    const ms = await loadTeamMembers(matchId)
    setMembers(ms)

    const { data: parts } = await supabase.from('participation').select('*, player:players(*)').eq('event_id', m.event_id)
    setParticipants((parts as Participation[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (id) loadAll(id) }, [id, loadAll])

  // Player search
  useEffect(() => {
    if (!playerSearch.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('players').select('id, name').ilike('name', `%${playerSearch.trim()}%`).limit(8)
      setSearchResults((data as Player[]) ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [playerSearch])

  async function handleRename(teamId: string, name: string) {
    await renameTeam(teamId, name)
    if (id) await loadAll(id)
    setEditingTeamName(null)
  }

  async function handleAssign(participationId: string, teamId: string | null) {
    if (!id) return
    await assignToTeam(id, participationId, teamId)
    if (id) await loadAll(id)
    setRolePickerFor(null)
  }

  async function handleRole(participationId: string, teamId: string, role: PlayerRole | null) {
    if (!id) return
    await setPlayerRole(id, participationId, teamId, role)
    if (id) await loadAll(id)
    setRolePickerFor(null)
  }

  async function handleBattingFirst(teamId: string) {
    if (!id) return
    await setBattingFirstTeam(id, teamId)
    navigate(`/match/${id}/innings/1`)
  }

  async function handleAddPlayer() {
    if (!id || !match || !newPlayerName.trim()) return
    setAddingPlayerError(null)
    try {
      const clean = cleanPlayerName(newPlayerName)
      const { data: existing } = await supabase.from('players').select('*').ilike('name', clean).limit(1)
      let playerId: string
      if (existing && existing.length > 0) {
        playerId = existing[0].id
      } else {
        const { data: newP, error } = await supabase.from('players').insert({ name: clean, mobile_number: null }).select().single()
        if (error) throw error
        playerId = newP.id
      }
      const existingPart = participants.find((p) => p.player_id === playerId)
      if (existingPart) { setAddingPlayerError('Player already in this event'); return }
      await supabase.from('participation').insert({
        event_id: match.event_id, player_id: playerId, status: 'playing',
        is_guest: false, added_by_organizer: true, responded_at: new Date().toISOString(),
      })
      setNewPlayerName('')
      setPlayerSearch('')
      setAddingPlayer(false)
      await loadAll(id)
    } catch (err) {
      setAddingPlayerError(err instanceof Error ? err.message : 'Failed to add player')
    }
  }

  if (adminState === 'checking') return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (adminState === 'viewer') return (
    <div className="px-4 py-12 text-center">
      <p className="text-zinc-400 text-sm mb-3">Organiser access required.</p>
      <button onClick={() => navigate(id ? `/match/${id}` : '/')} className="text-emerald-400 text-sm">← Back</button>
    </div>
  )
  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (error || !match || !teamA || !teamB) return (
    <div className="px-4 py-12 text-center">
      <p className="text-red-400 text-sm mb-3">{error ?? 'Match not found'}</p>
      <Link to="/" className="text-emerald-400 text-sm">← Back</Link>
    </div>
  )

  const getMember = (participationId: string) => members.find((m) => m.participation_id === participationId)
  const teamAMembers = members.filter((m) => m.team_id === teamA.id)
  const teamBMembers = members.filter((m) => m.team_id === teamB.id)
  const benchMembers = participants.filter((p) => p.status === 'playing' && !members.find((m) => m.participation_id === p.id && m.team_id))

  function renderPlayer(p: Participation, inTeam: Team | null) {
    const member = getMember(p.id)
    const isPickingRole = rolePickerFor === p.id
    return (
      <div key={p.id} className="bg-zinc-800 rounded-xl px-3 py-2.5 mb-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white">{p.player?.name}</span>
            {member?.role && <span className="text-xs text-emerald-400 font-semibold">{ROLE_LABELS[member.role]}</span>}
          </div>
          <div className="flex gap-2">
            {inTeam && (
              <button onClick={() => setRolePickerFor(isPickingRole ? null : p.id)} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-700 rounded">Role</button>
            )}
            {inTeam?.id === teamA?.id && <button onClick={() => handleAssign(p.id, teamB!.id)} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-700 rounded">→ {teamB?.name}</button>}
            {inTeam?.id === teamB?.id && <button onClick={() => handleAssign(p.id, teamA!.id)} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-700 rounded">→ {teamA?.name}</button>}
            {!inTeam && <button onClick={() => handleAssign(p.id, teamA!.id)} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-700 rounded">→ {teamA?.name}</button>}
            {!inTeam && <button onClick={() => handleAssign(p.id, teamB!.id)} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-700 rounded">→ {teamB?.name}</button>}
            {inTeam && <button onClick={() => handleAssign(p.id, null)} className="text-xs text-zinc-600 px-1">✕</button>}
          </div>
        </div>
        {isPickingRole && inTeam && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(['captain','vice_captain','wicket_keeper','substitute'] as PlayerRole[]).map((r) => (
              <button key={r} onClick={() => handleRole(p.id, inTeam.id, member?.role === r ? null : r)}
                className={`text-xs px-2 py-1 rounded ${member?.role === r ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-700 text-zinc-300'}`}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${id}`} className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">Teams & Toss</h1>
      </header>

      {/* Team A */}
      <div className="mb-4">
        {editingTeamName === teamA.id ? (
          <div className="flex gap-2 mb-2">
            <input value={teamNameInput} onChange={(e) => setTeamNameInput(e.target.value)} className="input flex-1 text-sm" autoFocus />
            <button onClick={() => handleRename(teamA.id, teamNameInput)} className="bg-emerald-500 text-zinc-950 font-semibold px-3 rounded-lg text-sm">Save</button>
          </div>
        ) : (
          <button onClick={() => { setEditingTeamName(teamA.id); setTeamNameInput(teamA.name) }} className="text-sm font-semibold text-white mb-2 flex items-center gap-1">
            {teamA.name} <span className="text-zinc-600 text-xs">✎</span>
          </button>
        )}
        {teamAMembers.map((m) => {
          const part = participants.find((p) => p.id === m.participation_id)
          return part ? renderPlayer(part, teamA) : null
        })}
      </div>

      {/* Team B */}
      <div className="mb-4">
        {editingTeamName === teamB.id ? (
          <div className="flex gap-2 mb-2">
            <input value={teamNameInput} onChange={(e) => setTeamNameInput(e.target.value)} className="input flex-1 text-sm" autoFocus />
            <button onClick={() => handleRename(teamB.id, teamNameInput)} className="bg-emerald-500 text-zinc-950 font-semibold px-3 rounded-lg text-sm">Save</button>
          </div>
        ) : (
          <button onClick={() => { setEditingTeamName(teamB.id); setTeamNameInput(teamB.name) }} className="text-sm font-semibold text-white mb-2 flex items-center gap-1">
            {teamB.name} <span className="text-zinc-600 text-xs">✎</span>
          </button>
        )}
        {teamBMembers.map((m) => {
          const part = participants.find((p) => p.id === m.participation_id)
          return part ? renderPlayer(part, teamB) : null
        })}
      </div>

      {/* Bench */}
      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">Bench ({benchMembers.length})</h2>

      {/* Add player */}
      {addingPlayer ? (
        <div className="flex flex-col gap-2 mb-3 bg-zinc-900 border border-zinc-700 rounded-xl p-3">
          <div className="relative">
            <input type="text" value={newPlayerName} onChange={(e) => { setNewPlayerName(e.target.value); setPlayerSearch(e.target.value); setAddingPlayerError(null) }}
              placeholder="Player name" className="input text-sm" autoFocus />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl mt-1 z-10 overflow-hidden">
                {searchResults.map((p) => (
                  <button key={p.id} onClick={() => { setNewPlayerName(p.name); setPlayerSearch(''); setSearchResults([]) }}
                    className="w-full text-left px-3 py-2.5 text-sm text-white active:bg-zinc-700">
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {addingPlayerError && <p className="text-red-400 text-xs">{addingPlayerError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAddPlayer} className="flex-1 bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2 text-sm">Add to Bench</button>
            <button onClick={() => { setAddingPlayer(false); setNewPlayerName(''); setAddingPlayerError(null) }} className="flex-1 bg-zinc-800 text-zinc-300 rounded-lg py-2 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingPlayer(true)} className="w-full bg-zinc-900 border border-dashed border-zinc-700 text-zinc-400 rounded-xl py-2.5 text-sm mb-3">
          + Add player
        </button>
      )}

      <div className="flex flex-col mb-6">
        {benchMembers.map((p) => renderPlayer(p, null))}
      </div>

      {/* Toss */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 mb-3">Who bats first?</p>
        <div className="flex gap-2">
          <button onClick={() => handleBattingFirst(teamA.id)}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border ${match.batting_first_team_id === teamA.id ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
            {teamA.name}
          </button>
          <button onClick={() => handleBattingFirst(teamB.id)}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border ${match.batting_first_team_id === teamB.id ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
            {teamB.name}
          </button>
        </div>
      </div>
    </div>
  )
}
