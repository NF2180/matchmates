import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ensureTeamsExist,
  loadTeamMembers,
  renameTeam,
  assignToTeam,
  setPlayerRole,
  setBattingFirstTeam,
} from '../lib/teams'
import { parseTeamAssignmentText } from '../lib/parseTeamText'
import type { Match, Participation, Team, TeamMember, PlayerRole } from '../types'

const ROLE_LABELS: Record<PlayerRole, string> = {
  captain: 'C',
  vice_captain: 'VC',
  wicket_keeper: 'WK',
  substitute: 'Sub',
}

export default function TeamSetup() {
  const { id } = useParams<{ id: string }>()
  const [match, setMatch] = useState<Match | null>(null)
  const [participants, setParticipants] = useState<Participation[]>([])
  const [teamA, setTeamA] = useState<Team | null>(null)
  const [teamB, setTeamB] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [applyingPaste, setApplyingPaste] = useState(false)

  const [editingTeamName, setEditingTeamName] = useState<string | null>(null)
  const [teamNameInput, setTeamNameInput] = useState('')

  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null)

  const loadAll = useCallback(async (matchId: string) => {
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

    try {
      const { teamA: a, teamB: b } = await ensureTeamsExist(matchId)
      setTeamA(a)
      setTeamB(b)

      const memberRows = await loadTeamMembers(matchId)
      setMembers(memberRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up teams')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount/id change
    if (id) loadAll(id)
  }, [id, loadAll])

  function memberFor(participationId: string): TeamMember | undefined {
    return members.find((m) => m.participation_id === participationId)
  }

  async function handleAssign(participationId: string, teamId: string | null) {
    if (!id) return
    await assignToTeam(id, participationId, teamId)
    await loadAll(id)
  }

  async function handleSetRole(participationId: string, teamId: string | null, role: PlayerRole | null) {
    if (!id) return
    await setPlayerRole(id, participationId, teamId, role)
    setRolePickerFor(null)
    await loadAll(id)
  }

  async function handleRenameTeam(teamId: string) {
    if (!teamNameInput.trim()) {
      setEditingTeamName(null)
      return
    }
    await renameTeam(teamId, teamNameInput.trim())
    setEditingTeamName(null)
    if (id) await loadAll(id)
  }

  async function handleBattingFirst(teamId: string) {
    if (!id) return
    await setBattingFirstTeam(id, teamId)
    if (id) await loadAll(id)
  }

  async function applyParsedAssignments(parsed: ReturnType<typeof parseTeamAssignmentText>) {
    if (!id || !teamA || !teamB) return
    for (const item of parsed) {
      if (!item.matchedPlayer) continue
      const teamId = item.side === 'A' ? teamA.id : teamB.id
      await assignToTeam(id, item.matchedPlayer.id, teamId)
    }
    await loadAll(id)
  }

  async function handlePasteApply() {
    setPasteError(null)
    if (!teamA || !teamB) return

    const candidates = participants.map((p) => ({ id: p.id, name: p.player?.name ?? '' }))
    const parsed = parseTeamAssignmentText(pasteText, candidates)

    if (parsed.length === 0) {
      setPasteError('Could not find any "Team A" / "Team B" sections. Use commas between multi-word names.')
      return
    }

    const unmatched = parsed.filter((p) => !p.matchedPlayer)

    setApplyingPaste(true)
    await applyParsedAssignments(parsed)
    setApplyingPaste(false)

    if (unmatched.length > 0) {
      setPasteError(
        `Applied. Could not match: ${unmatched.map((u) => u.rawName).join(', ')} — assign manually below.`
      )
    } else {
      setShowPaste(false)
      setPasteText('')
    }
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  }

  if (error || !match || !teamA || !teamB) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error ?? 'Match not found'}</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  const benchMembers = participants.filter((p) => !memberFor(p.id)?.team_id)
  const teamAMembers = participants.filter((p) => memberFor(p.id)?.team_id === teamA.id)
  const teamBMembers = participants.filter((p) => memberFor(p.id)?.team_id === teamB.id)

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${match.id}`} className="text-sm text-zinc-500 mb-2 inline-block">
          ← Back to match
        </Link>
        <h1 className="text-xl font-bold text-white">Teams & Toss</h1>
        <p className="text-sm text-zinc-400">{match.match_name}</p>
      </header>

      {!showPaste ? (
        <button
          onClick={() => setShowPaste(true)}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium rounded-xl py-3 text-sm mb-6"
        >
          📋 Paste Team Assignment
        </button>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">Paste Team Assignment</h3>
            <button onClick={() => setShowPaste(false)} className="text-zinc-500 text-xs">✕</button>
          </div>
          <p className="text-xs text-zinc-500 mb-2">
            e.g. "Team A Raj Nitin Vipul" then "Team B Rahul Siraj Amit". Use commas between
            multi-word names.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Team A\nRaj, Nitin, Vipul\n\nTeam B\nRahul, Siraj, Amit'}
            className="input min-h-[120px] resize-none mb-2"
          />
          {pasteError && <div className="text-amber-400 text-xs mb-2">{pasteError}</div>}
          <button
            onClick={handlePasteApply}
            disabled={!pasteText.trim() || applyingPaste}
            className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm"
          >
            {applyingPaste ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}

      <TeamColumn
        team={teamA}
        members={teamAMembers}
        memberFor={memberFor}
        onAssign={handleAssign}
        onSetRole={(pid, role) => handleSetRole(pid, teamA.id, role)}
        editingTeamName={editingTeamName}
        teamNameInput={teamNameInput}
        onStartRename={() => {
          setEditingTeamName(teamA.id)
          setTeamNameInput(teamA.name)
        }}
        onTeamNameInputChange={setTeamNameInput}
        onRenameConfirm={() => handleRenameTeam(teamA.id)}
        rolePickerFor={rolePickerFor}
        setRolePickerFor={setRolePickerFor}
        otherTeamId={teamB.id}
      />

      <TeamColumn
        team={teamB}
        members={teamBMembers}
        memberFor={memberFor}
        onAssign={handleAssign}
        onSetRole={(pid, role) => handleSetRole(pid, teamB.id, role)}
        editingTeamName={editingTeamName}
        teamNameInput={teamNameInput}
        onStartRename={() => {
          setEditingTeamName(teamB.id)
          setTeamNameInput(teamB.name)
        }}
        onTeamNameInputChange={setTeamNameInput}
        onRenameConfirm={() => handleRenameTeam(teamB.id)}
        rolePickerFor={rolePickerFor}
        setRolePickerFor={setRolePickerFor}
        otherTeamId={teamA.id}
      />

      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3 mt-2">
        Bench ({benchMembers.length})
      </h2>
      <div className="flex flex-col gap-2 mb-6">
        {benchMembers.length === 0 && (
          <div className="text-zinc-600 text-sm py-3 text-center border border-dashed border-zinc-800 rounded-lg">
            Everyone is assigned
          </div>
        )}
        {benchMembers.map((p) => (
          <BenchRow key={p.id} participation={p} teamA={teamA} teamB={teamB} onAssign={handleAssign} />
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Who's batting first?</h3>
        <p className="text-xs text-zinc-500 mb-3">No formal toss recorded — just pick directly.</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleBattingFirst(teamA.id)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium border ${
              match.batting_first_team_id === teamA.id
                ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
            }`}
          >
            {teamA.name}
          </button>
          <button
            onClick={() => handleBattingFirst(teamB.id)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium border ${
              match.batting_first_team_id === teamB.id
                ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
            }`}
          >
            {teamB.name}
          </button>
        </div>
      </div>
    </div>
  )
}

interface TeamColumnProps {
  team: Team
  members: Participation[]
  memberFor: (participationId: string) => TeamMember | undefined
  onAssign: (participationId: string, teamId: string | null) => void
  onSetRole: (participationId: string, role: PlayerRole | null) => void
  editingTeamName: string | null
  teamNameInput: string
  onStartRename: () => void
  onTeamNameInputChange: (v: string) => void
  onRenameConfirm: () => void
  rolePickerFor: string | null
  setRolePickerFor: (v: string | null) => void
  otherTeamId: string
}

function TeamColumn({
  team,
  members,
  memberFor,
  onAssign,
  onSetRole,
  editingTeamName,
  teamNameInput,
  onStartRename,
  onTeamNameInputChange,
  onRenameConfirm,
  rolePickerFor,
  setRolePickerFor,
  otherTeamId,
}: TeamColumnProps) {
  const takenRoles = new Set(
    members.map((m) => memberFor(m.id)?.role).filter((r): r is PlayerRole => !!r)
  )

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        {editingTeamName === team.id ? (
          <div className="flex gap-2 flex-1">
            <input
              type="text"
              value={teamNameInput}
              onChange={(e) => onTeamNameInputChange(e.target.value)}
              className="input py-1.5 text-sm flex-1"
              autoFocus
            />
            <button onClick={onRenameConfirm} className="text-emerald-400 text-xs font-medium">
              Save
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-white">
              {team.name} ({members.length})
            </h2>
            <button onClick={onStartRename} className="text-xs text-zinc-500">
              Rename
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {members.length === 0 && (
          <div className="text-zinc-600 text-sm py-3 text-center border border-dashed border-zinc-800 rounded-lg">
            No players yet — tap a bench player below to add
          </div>
        )}
        {members.map((p) => {
          const member = memberFor(p.id)
          return (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
                  {p.player?.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate flex items-center gap-1.5">
                    {p.player?.name ?? 'Unknown'}
                    {member?.role && (
                      <span className="text-xs bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setRolePickerFor(rolePickerFor === p.id ? null : p.id)}
                  className="text-xs text-zinc-500 px-2 py-1"
                >
                  Role
                </button>
                <button
                  onClick={() => onAssign(p.id, otherTeamId)}
                  className="text-xs text-zinc-500 px-2 py-1"
                >
                  ↔
                </button>
                <button onClick={() => onAssign(p.id, null)} className="text-xs text-red-400 px-2 py-1">
                  Bench
                </button>
              </div>

              {rolePickerFor === p.id && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {(Object.keys(ROLE_LABELS) as PlayerRole[]).map((role) => {
                    const isTaken = takenRoles.has(role) && member?.role !== role
                    return (
                      <button
                        key={role}
                        disabled={isTaken}
                        onClick={() => onSetRole(p.id, member?.role === role ? null : role)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          member?.role === role
                            ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                            : isTaken
                              ? 'bg-zinc-900 text-zinc-600 border-zinc-800 opacity-50'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BenchRow({
  participation,
  teamA,
  teamB,
  onAssign,
}: {
  participation: Participation
  teamA: Team
  teamB: Team
  onAssign: (participationId: string, teamId: string | null) => void
}) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
        {participation.player?.name?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{participation.player?.name ?? 'Unknown'}</div>
        <div className="text-xs text-zinc-500">{statusLabel(participation.status)}</div>
      </div>
      <button
        onClick={() => onAssign(participation.id, teamA.id)}
        className="text-xs bg-zinc-800 text-zinc-200 px-2.5 py-1.5 rounded-lg"
      >
        → {teamA.name}
      </button>
      <button
        onClick={() => onAssign(participation.id, teamB.id)}
        className="text-xs bg-zinc-800 text-zinc-200 px-2.5 py-1.5 rounded-lg"
      >
        → {teamB.name}
      </button>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'playing') return 'Confirmed playing'
  if (status === 'not_playing') return 'Said not playing'
  return 'Pending response'
}
