import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadDeliveries, loadInningsForMatch } from '../lib/scoringDb'
import { computeInningsState } from '../lib/scoringEngine'
import type {
  Match,
  Team,
  Innings,
  Player,
  DeliveryRecord,
} from '../types'
import type { InningsState } from '../lib/scoringEngine'

interface InningsBundle {
  innings: Innings
  battingTeam: Team
  bowlingTeam: Team
  battingPlayers: Player[]
  bowlingPlayers: Player[]
  state: InningsState
}

export default function MatchScorecard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')

  const [match, setMatch] = useState<Match | null>(null)
  const [bundles, setBundles] = useState<InningsBundle[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async (matchId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single()
      if (matchError) throw matchError
      setMatch(matchData as Match)

      const innings = await loadInningsForMatch(matchId)
      if (innings.length === 0) {
        setBundles([])
        setLoading(false)
        return
      }

      const { data: teamsData } = await supabase.from('teams').select('*').eq('match_id', matchId)
      const teams = (teamsData as Team[]) ?? []
      const teamById = (tid: string) => teams.find((t) => t.id === tid)

      const built: InningsBundle[] = []

      for (const inn of innings) {
        const battingTeam = teamById(inn.batting_team_id)
        const bowlingTeam = teamById(inn.bowling_team_id)
        if (!battingTeam || !bowlingTeam) continue

        const { data: batMembers } = await supabase
          .from('team_members')
          .select('participation:participation(player:players(*))')
          .eq('team_id', inn.batting_team_id)

        const { data: bowlMembers } = await supabase
          .from('team_members')
          .select('participation:participation(player:players(*))')
          .eq('team_id', inn.bowling_team_id)

        const extract = (members: unknown[]): Player[] =>
          (members as Array<{ participation: { player: Player } }>)
            .map((m) => m.participation?.player)
            .filter((p): p is Player => !!p)

        const battingPlayers = extract(batMembers ?? [])
        const bowlingPlayers = extract(bowlMembers ?? [])

        const rawDeliveries = await loadDeliveries(inn.id)
        const deliveries = (rawDeliveries as DeliveryRecord[]).map((d) => ({
          id: d.id,
          over_number: d.over_number,
          ball_number: d.ball_number,
          is_legal: d.is_legal,
          striker_id: d.striker_id,
          non_striker_id: d.non_striker_id,
          bowler_id: d.bowler_id,
          batter_runs: d.batter_runs,
          extra_runs: d.extra_runs,
          total_runs: d.total_runs,
          extra_type: d.extra_type,
          is_free_hit: d.is_free_hit,
          is_wicket: d.is_wicket,
          wicket_type: d.wicket_type,
          dismissed_player_id: d.dismissed_player_id,
          fielder_id: d.fielder_id,
        }))

        const state = computeInningsState(deliveries, battingPlayers.length, inn.overs_limit)

        built.push({ innings: inn, battingTeam, bowlingTeam, battingPlayers, bowlingPlayers, state })
      }

      setBundles(built)
      setActiveTab(built.length - 1) // default to most recent/current innings
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scorecard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount
    if (id) loadAll(id)
  }, [id, loadAll])

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading scorecard…</div>
  }

  if (error || !match) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error ?? 'Match not found'}</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  if (bundles.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <Link to={`/match/${match.id}`} className="text-sm text-zinc-500 mb-4 inline-block">← Back to match</Link>
        <p className="text-zinc-500 text-sm">No innings have started yet.</p>
      </div>
    )
  }

  const active = bundles[activeTab]

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${match.id}`} className="text-sm text-zinc-500 mb-2 inline-block">← Back to match</Link>
        <h1 className="text-xl font-bold text-white">{match.match_name}</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Scorecard</p>
      </header>

      {bundles.length > 1 && (
        <div className="flex gap-2 mb-5">
          {bundles.map((b, i) => (
            <button
              key={b.innings.id}
              onClick={() => setActiveTab(i)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${
                activeTab === i
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
              }`}
            >
              {b.battingTeam.name}
            </button>
          ))}
        </div>
      )}

      <InningsCard bundle={active} />

      {next === 'innings2' && match.status !== 'completed' && (
        <Link
          to={`/match/${match.id}/innings/2`}
          className="w-full bg-emerald-500 active:bg-emerald-600 text-zinc-950 font-bold rounded-xl py-3.5 text-center text-base mt-6"
        >
          Start Innings 2 →
        </Link>
      )}

      {match.status === 'completed' && (
        <button
          onClick={() => navigate(`/match/${match.id}`)}
          className="w-full bg-zinc-800 text-zinc-200 font-medium rounded-xl py-3 text-center text-sm mt-6"
        >
          Back to Match
        </button>
      )}
    </div>
  )
}

function InningsCard({ bundle }: { bundle: InningsBundle }) {
  const { innings, battingTeam, bowlingTeam, battingPlayers, bowlingPlayers, state } = bundle

  const playerName = (playerId: string, pool: Player[]) =>
    pool.find((p) => p.id === playerId)?.name ?? 'Unknown'

  const oversDisplay = `${state.overs_completed}.${state.balls_in_current_over}`
  const runRate = state.balls_bowled_total > 0
    ? (state.total_runs / (state.balls_bowled_total / 6)).toFixed(2)
    : '0.00'

  return (
    <div className="flex flex-col gap-5">
      {/* Innings summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
        <div className="text-xs text-zinc-500 mb-1">
          {battingTeam.name} batting vs {bowlingTeam.name} · {innings.status === 'completed' ? 'Innings complete' : 'In progress'}
        </div>
        <div className="text-3xl font-bold text-white">
          {state.total_runs}/{state.wickets}
        </div>
        <div className="text-sm text-zinc-400 mt-0.5">
          {oversDisplay} overs · RR {runRate}
          {innings.target && ` · Target ${innings.target}`}
        </div>
      </div>

      {/* Batting card */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Batting</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 px-3 py-2 text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
            <span>Batter</span>
            <span className="text-right w-8">R</span>
            <span className="text-right w-8">B</span>
            <span className="text-right w-6">4s</span>
            <span className="text-right w-6">6s</span>
            <span className="text-right w-10">SR</span>
          </div>
          {state.batters.map((b) => {
            const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'
            return (
              <div key={b.player_id} className="px-3 py-2.5 border-b border-zinc-800/60 last:border-0">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center">
                  <span className="text-sm text-white truncate">{playerName(b.player_id, battingPlayers)}</span>
                  <span className="text-sm text-white text-right w-8 font-medium">{b.runs}</span>
                  <span className="text-sm text-zinc-400 text-right w-8">{b.balls}</span>
                  <span className="text-sm text-zinc-400 text-right w-6">{b.fours}</span>
                  <span className="text-sm text-zinc-400 text-right w-6">{b.sixes}</span>
                  <span className="text-sm text-zinc-400 text-right w-10">{sr}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {dismissalText(b, bowlingPlayers)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Extras + total */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Extras</span>
          <span className="text-white">
            {state.extras.total}
            <span className="text-zinc-500 text-xs ml-1">
              (b {state.extras.byes}, lb {state.extras.leg_byes}, wd {state.extras.wides}, nb {state.extras.no_balls})
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between text-sm font-semibold mt-1.5 pt-1.5 border-t border-zinc-800">
          <span className="text-white">Total</span>
          <span className="text-white">{state.total_runs}/{state.wickets} ({oversDisplay} ov)</span>
        </div>
      </div>

      {/* Fall of wickets */}
      {state.fall_of_wickets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Fall of Wickets</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-sm text-zinc-300 leading-relaxed">
              {state.fall_of_wickets.map((fow, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {fow.wicket}-{fow.runs}
                  <span className="text-zinc-500"> ({playerName(fow.player_id, battingPlayers).split(' ')[0]}, {fow.over} ov)</span>
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Bowling card */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Bowling</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
            <span>Bowler</span>
            <span className="text-right w-10">O</span>
            <span className="text-right w-8">R</span>
            <span className="text-right w-6">W</span>
            <span className="text-right w-10">Econ</span>
          </div>
          {state.bowlers.map((bw) => {
            const totalBalls = bw.overs * 6 + bw.balls
            const econ = totalBalls > 0 ? (bw.runs / (totalBalls / 6)).toFixed(2) : '0.00'
            return (
              <div
                key={bw.player_id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2.5 border-b border-zinc-800/60 last:border-0"
              >
                <span className="text-sm text-white truncate">{playerName(bw.player_id, bowlingPlayers)}</span>
                <span className="text-sm text-zinc-400 text-right w-10">{bw.overs}.{bw.balls}</span>
                <span className="text-sm text-zinc-400 text-right w-8">{bw.runs}</span>
                <span className="text-sm text-white text-right w-6 font-medium">{bw.wickets}</span>
                <span className="text-sm text-zinc-400 text-right w-10">{econ}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function dismissalText(
  b: { is_out: boolean; wicket_type: string | null; bowler_id: string | null; fielder_id: string | null },
  bowlingPlayers: Player[]
): string {
  if (!b.is_out) return 'not out'

  const bowlerName = b.bowler_id ? bowlingPlayers.find((p) => p.id === b.bowler_id)?.name.split(' ')[0] : ''
  const fielderName = b.fielder_id ? bowlingPlayers.find((p) => p.id === b.fielder_id)?.name.split(' ')[0] : ''

  switch (b.wicket_type) {
    case 'bowled':
      return `b ${bowlerName}`
    case 'caught':
      return fielderName ? `c ${fielderName} b ${bowlerName}` : `c & b ${bowlerName}`
    case 'lbw':
      return `lbw b ${bowlerName}`
    case 'stumped':
      return `st ${fielderName} b ${bowlerName}`
    case 'run_out':
      return fielderName ? `run out (${fielderName})` : 'run out'
    case 'hit_wicket':
      return `hit wicket b ${bowlerName}`
    case 'retired_hurt':
      return 'retired hurt'
    default:
      return 'out'
  }
}
