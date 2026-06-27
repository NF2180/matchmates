import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createInnings } from '../lib/scoringDb'
import { useAdminAccess } from '../hooks/useAdminAccess'
import type { Match, Team, Player } from '../types'

export default function InningsSetup() {
  const { id, inningsNum } = useParams<{ id: string; inningsNum: string }>()
  const navigate = useNavigate()
  const inningsNumber = parseInt(inningsNum ?? '1', 10)
  const adminState = useAdminAccess(id)

  const [match, setMatch] = useState<Match | null>(null)
  const [battingTeam, setBattingTeam] = useState<Team | null>(null)
  const [bowlingTeam, setBowlingTeam] = useState<Team | null>(null)
  const [battingPlayers, setBattingPlayers] = useState<Player[]>([])
  const [bowlingPlayers, setBowlingPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [striker, setStriker] = useState('')
  const [nonStriker, setNonStriker] = useState('')
  const [bowler, setBowler] = useState('')
  const [oversLimit, setOversLimit] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const loadData = useCallback(async (matchId: string) => {
    setLoading(true)
    setError(null)

    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (matchError || !matchData) {
      setError(matchError?.message ?? 'Match not found')
      setLoading(false)
      return
    }
    const m = matchData as Match
    setMatch(m)

    // For innings 2, default overs to whatever innings 1 was actually played at,
    // not the match's stored overs value (which may differ if organiser changed it).
    if (inningsNumber === 2) {
      const { data: inn1 } = await supabase
        .from('innings')
        .select('overs_limit')
        .eq('match_id', matchId)
        .eq('innings_number', 1)
        .maybeSingle()
      setOversLimit(inn1?.overs_limit?.toString() ?? m.overs?.toString() ?? '10')
    } else {
      setOversLimit(m.overs?.toString() ?? '10')
    }

    // Load teams
    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .eq('match_id', matchId)

    if (!teams || teams.length < 2) {
      setError('Teams not set up yet. Complete Team Setup first.')
      setLoading(false)
      return
    }

    // For innings 1: batting team = batting_first_team_id
    // For innings 2: batting team = the other team
    const bat = inningsNumber === 1
      ? teams.find((t) => t.id === m.batting_first_team_id)
      : teams.find((t) => t.id !== m.batting_first_team_id)
    const bowl = teams.find((t) => t.id !== bat?.id)

    if (!bat || !bowl) {
      setError('Batting first team not set. Complete Team Setup first.')
      setLoading(false)
      return
    }

    setBattingTeam(bat as Team)
    setBowlingTeam(bowl as Team)

    // Load players for each team via team_members
    const { data: batMembers } = await supabase
      .from('team_members')
      .select('participation:participation(player:players(*))')
      .eq('team_id', bat.id)

    const { data: bowlMembers } = await supabase
      .from('team_members')
      .select('participation:participation(player:players(*))')
      .eq('team_id', bowl.id)

    const extractPlayers = (members: unknown[]): Player[] =>
      (members as Array<{ participation: { player: Player } }>)
        .map((m) => m.participation?.player)
        .filter((p): p is Player => !!p)

    setBattingPlayers(extractPlayers(batMembers ?? []))
    setBowlingPlayers(extractPlayers(bowlMembers ?? []))
    setLoading(false)
  }, [inningsNumber])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) loadData(id)
  }, [id, loadData])

  async function handleStart() {
    setStartError(null)
    if (!striker) { setStartError('Select striker'); return }
    if (!nonStriker) { setStartError('Select non-striker'); return }
    if (striker === nonStriker) { setStartError('Striker and non-striker must be different players'); return }
    if (!bowler) { setStartError('Select opening bowler'); return }
    if (!oversLimit || parseInt(oversLimit, 10) < 1) { setStartError('Set overs per side'); return }
    if (!match || !battingTeam || !bowlingTeam) return

    setStarting(true)
    try {
      // For innings 2, fetch innings 1 total to set target
      let target: number | null = null
      if (inningsNumber === 2) {
        const { data: inn1 } = await supabase
          .from('innings')
          .select('id')
          .eq('match_id', match.id)
          .eq('innings_number', 1)
          .single()

        if (inn1) {
          const { data: dels } = await supabase
            .from('deliveries')
            .select('total_runs')
            .eq('innings_id', inn1.id)
          const inn1Total = (dels ?? []).reduce((sum: number, d: { total_runs: number }) => sum + d.total_runs, 0)
          target = inn1Total + 1
        }
      }

      const innings = await createInnings(
        match.id,
        inningsNumber,
        battingTeam.id,
        bowlingTeam.id,
        parseInt(oversLimit, 10),
        target
      )

      const initPayload = JSON.stringify({ strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler })
      sessionStorage.setItem('innings_init', initPayload)
      localStorage.setItem(`innings_init_${innings.id}`, initPayload)
      navigate(`/match/${match.id}/scoring/${innings.id}`)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start innings')
    } finally {
      setStarting(false)
    }
  }

  if (adminState === 'checking') return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (adminState === 'viewer') {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-zinc-400 text-sm mb-3">You need to be the match organiser to set up an innings.</p>
        <button onClick={() => navigate(id ? `/match/${id}` : '/')} className="text-emerald-400 text-sm">← Back to match</button>
      </div>
    )
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>

  if (error || !match || !battingTeam || !bowlingTeam) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error ?? 'Setup error'}</p>
        <Link to={`/match/${id}`} className="text-emerald-400 text-sm">← Back to match</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${match.id}`} className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">
          Innings {inningsNumber} Setup
        </h1>
        <p className="text-sm text-zinc-400">
          <span className="text-emerald-400">{battingTeam.name}</span> batting vs {bowlingTeam.name}
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <Field label="Overs per side">
          <input
            type="number"
            value={oversLimit}
            onChange={(e) => setOversLimit(e.target.value)}
            className="input"
            min={1}
            max={50}
          />
        </Field>

        <Field label={`Opening Striker (${battingTeam.name})`}>
          <select value={striker} onChange={(e) => setStriker(e.target.value)} className="input">
            <option value="">Select player</option>
            {battingPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label={`Non-Striker (${battingTeam.name})`}>
          <select value={nonStriker} onChange={(e) => setNonStriker(e.target.value)} className="input">
            <option value="">Select player</option>
            {battingPlayers.filter((p) => p.id !== striker).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label={`Opening Bowler (${bowlingTeam.name})`}>
          <select value={bowler} onChange={(e) => setBowler(e.target.value)} className="input">
            <option value="">Select player</option>
            {bowlingPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        {startError && (
          <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
            {startError}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base mt-2"
        >
          {starting ? 'Starting…' : `Start Innings ${inningsNumber}`}
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
