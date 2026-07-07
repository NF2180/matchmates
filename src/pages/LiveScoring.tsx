import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeInningsState, canBowlNextOver, oversDisplay } from '../lib/scoringEngine'
import type { ExtraType, Delivery, WicketType, InningsState, BatterStats, BowlerStats } from '../lib/scoringEngine'
import { loadDeliveries, saveDelivery, deleteLastDelivery, completeInnings, completeMatch } from '../lib/scoringDb'
import type { InningsRow } from '../lib/scoringDb'
import WicketModal from '../components/WicketModal'
import type { WicketResult } from '../components/WicketModal'
import { useAdminAccess } from '../hooks/useAdminAccess'
import type { Player } from '../types'

type OverEndState = 'idle' | 'needs_bowler' | 'confirmed'

export default function LiveScoring() {
  const { id: matchId, inningsId } = useParams<{ id: string; inningsId: string }>()
  const navigate = useNavigate()
  const adminState = useAdminAccess(matchId)

  // Player IDs stored by InningsSetup before navigating.
  // sessionStorage is the primary source; localStorage is the fallback for tab-close resume.
  const initData = JSON.parse(
    sessionStorage.getItem('innings_init') ??
    localStorage.getItem(`innings_init_${inningsId}`) ??
    '{}'
  )
  const initStriker = initData.strikerId ?? ''
  const initNonStriker = initData.nonStrikerId ?? ''
  const initBowler = initData.bowlerId ?? ''

  const [innings, setInnings] = useState<InningsRow | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [state, setState] = useState<InningsState | null>(null)
  const [battingPlayers, setBattingPlayers] = useState<Player[]>([])
  const [bowlingPlayers, setBowlingPlayers] = useState<Player[]>([])
  const [wicketKeeperId, setWicketKeeperId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Striker/non-striker/bowler — initialised from URL params, then managed locally
  const [strikerId, setStrikerId] = useState(initStriker)
  const [nonStrikerId, setNonStrikerId] = useState(initNonStriker)
  const [bowlerId, setBowlerId] = useState(initBowler)

  // UI state
  const [showWicket, setShowWicket] = useState(false)
  const [overEndState, setOverEndState] = useState<OverEndState>('idle')
  const [nextBowlerId, setNextBowlerId] = useState('')
  const [showNextBatter, setShowNextBatter] = useState(false)
  const [nextBatterId, setNextBatterId] = useState('')
  const [showEndInnings, setShowEndInnings] = useState(false)
  const [ending, setEnding] = useState(false)
  const [byePickerType, setByePickerType] = useState<'bye' | 'leg_bye' | null>(null)
  const [extraBallPicker, setExtraBallPicker] = useState<'wide' | 'no_ball' | null>(null)
  const [extraBallRuns, setExtraBallRuns] = useState(0)
  const [extraBallWicket, setExtraBallWicket] = useState(false)

  // Sequence counter for deliveries
  const sequenceRef = useRef(0)

  const loadAll = useCallback(async () => {
    if (!inningsId || !matchId) return
    setLoading(true)
    setError(null)

    try {
      const { data: innData } = await supabase
        .from('innings')
        .select('*')
        .eq('id', inningsId)
        .single()
      if (!innData) throw new Error('Innings not found')
      const inn = innData as InningsRow
      setInnings(inn)

      // If innings already completed, redirect to scorecard instead of showing scoring UI
      if (inn.status === 'completed') {
        navigate(`/match/${matchId}/scorecard`)
        return
      }

      // Load teams' players using same query pattern as loadTeamMembers
      const { data: batMembers } = await supabase
        .from('team_members')
        .select('*, participation:participation(*, player:players(*))')
        .eq('match_id', matchId)
        .eq('team_id', inn.batting_team_id)

      const { data: bowlMembers } = await supabase
        .from('team_members')
        .select('*, participation:participation(*, player:players(*))')
        .eq('match_id', matchId)
        .eq('team_id', inn.bowling_team_id)

      const extract = (members: unknown[]): Player[] =>
        (members as Array<{ participation: { player: Player } }>)
          .map((m) => m.participation?.player)
          .filter((p): p is Player => !!p && !!p.id)

      // Find wicketkeeper in bowling team for auto-select on stumping
      const wkMember = (bowlMembers ?? []).find(
        (m: { role?: string | null }) => m.role === 'wicket_keeper'
      ) as { participation?: { player?: Player } } | undefined
      const wkId = wkMember?.participation?.player?.id ?? null
      if (wkId) setWicketKeeperId(wkId)

      setBattingPlayers(extract(batMembers ?? []))
      setBowlingPlayers(extract(bowlMembers ?? []))

      const rawDeliveries = await loadDeliveries(inningsId)
      sequenceRef.current = rawDeliveries.length

      // Map DB rows to engine Delivery shape
      const mapped: Delivery[] = rawDeliveries.map((d) => ({
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

      setDeliveries(mapped)
      const computed = computeInningsState(mapped, extract(batMembers ?? []).length, inn.overs_limit, inn.target)
      setState(computed)

      // Restore current players from last delivery if we don't have URL params
      if (mapped.length > 0 && !initStriker) {
        const last = mapped[mapped.length - 1]
        const nextStriker = computed.current_striker_id ?? last.striker_id
        const nextNonStriker = computed.current_non_striker_id ?? last.non_striker_id
        const nextBowler = computed.current_bowler_id ?? last.bowler_id
        setStrikerId(nextStriker)
        setNonStrikerId(nextNonStriker)
        setBowlerId(nextBowler)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load innings')
    } finally {
      setLoading(false)
    }
  }, [inningsId, matchId, initStriker])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  function playerById(id: string): Player | undefined {
    return [...battingPlayers, ...bowlingPlayers].find((p) => p.id === id)
  }

  function currentState() {
    return computeInningsState(deliveries, battingPlayers.length, innings?.overs_limit ?? 10, innings?.target)
  }

  async function recordBall(opts: {
    batterRuns: number
    extraRuns: number
    extraType: ExtraType | null
    isLegal: boolean
    isWicket: boolean
    wicketType?: string | null
    dismissedPlayerId?: string | null
    fielderId?: string | null
  }) {
    if (!innings || !matchId || !strikerId || !nonStrikerId || !bowlerId) return
    if (saving) return

    setSaving(true)
    try {
      const cs = currentState()
      const isFreehit = cs.next_ball_is_free_hit

      const overNum = cs.overs_completed
      const ballNum = cs.balls_in_current_over

      await saveDelivery({
        inningsId: innings.id,
        matchId,
        inningsNumber: innings.innings_number,
        overNumber: overNum,
        ballNumber: ballNum,
        isLegal: opts.isLegal,
        strikerId,
        nonStrikerId,
        bowlerId,
        batterRuns: opts.batterRuns,
        extraRuns: opts.extraRuns,
        extraType: opts.extraType,
        isFreehit,
        isWicket: opts.isWicket,
        wicketType: (opts.wicketType as WicketType | null) ?? null,
        dismissedPlayerId: opts.dismissedPlayerId ?? null,
        fielderId: opts.fielderId ?? null,
      })

      // Reload all deliveries and recompute state
      const rawDeliveries = await loadDeliveries(innings.id)
      const mapped: Delivery[] = rawDeliveries.map((d) => ({
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
      setDeliveries(mapped)

      const newState = computeInningsState(mapped, battingPlayers.length, innings.overs_limit, innings.target)
      setState(newState)

      // Update striker/non-striker from engine
      if (newState.current_striker_id) setStrikerId(newState.current_striker_id)
      if (newState.current_non_striker_id) setNonStrikerId(newState.current_non_striker_id)

      // Wicket: need next batter unless innings complete
      if (opts.isWicket && !newState.is_complete) {
        setShowNextBatter(true)
        return
      }

      // Over complete: need next bowler.
      // Guard: only trigger if the previous delivery was the LAST ball of the over
      // (balls_in_current_over flips to 0 after completing 6 legal balls).
      // After undo, balls_in_current_over is also 0 at start of a resumed over —
      // we distinguish by checking if overs_completed increased vs previous state.
      const prevOversCompleted = state?.overs_completed ?? 0
      if (
        opts.isLegal &&
        newState.balls_in_current_over === 0 &&
        newState.overs_completed > prevOversCompleted &&
        !newState.is_complete
      ) {
        setOverEndState('needs_bowler')
        return
      }

      // Innings complete
      if (newState.is_complete) {
        await handleInningsComplete(newState.total_runs)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save delivery')
    } finally {
      setSaving(false)
    }
  }

  async function handleUndo() {
    if (!innings || saving) return
    setSaving(true)
    try {
      await deleteLastDelivery(innings.id)
      // Reload deliveries without touching player state
      const { data: raw } = await supabase
        .from('deliveries')
        .select('*')
        .eq('innings_id', innings.id)
        .order('created_at', { ascending: true })

      const mapped = (raw ?? []).map((d) => ({
        id: d.id as string,
        striker_id: d.striker_id as string,
        non_striker_id: d.non_striker_id as string,
        bowler_id: d.bowler_id as string,
        batter_runs: d.batter_runs as number,
        extra_runs: d.extra_runs as number,
        total_runs: d.total_runs as number,
        extra_type: d.extra_type as string | null,
        is_free_hit: d.is_free_hit as boolean,
        is_wicket: d.is_wicket as boolean,
        wicket_type: d.wicket_type as string | null,
        dismissed_player_id: d.dismissed_player_id as string | null,
        fielder_id: d.fielder_id as string | null,
        is_legal: d.is_legal as boolean,
      })) as Delivery[]
        extra_type: d.extra_type,
        is_free_hit: d.is_free_hit,
        is_wicket: d.is_wicket,
        wicket_type: d.wicket_type,
        dismissed_player_id: d.dismissed_player_id,
        fielder_id: d.fielder_id,
        is_legal: d.is_legal,
      }))

      setDeliveries(mapped)
      const computed = computeInningsState(mapped, battingPlayers.length, innings.overs_limit, innings.target)
      setState(computed)
      setOverEndState('idle')
      setShowNextBatter(false)

      // Restore players from last delivery — never prompt again
      if (mapped.length > 0) {
        const last = mapped[mapped.length - 1]
        setStrikerId(last.striker_id)
        setNonStrikerId(last.non_striker_id)
        setBowlerId(last.bowler_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleInningsComplete(totalRuns: number) {
    if (!innings || !matchId) return
    await completeInnings(innings.id, totalRuns)

    if (innings.innings_number === 1) {
      // Show innings 1 scorecard before starting innings 2
      navigate(`/match/${matchId}/scorecard?next=innings2`)
    } else {
      // Match over — show final scorecard
      await completeMatch(matchId)
      navigate(`/match/${matchId}/scorecard`)
    }
  }

  async function handleEndInningsManually() {
    if (!innings || !state) return
    setEnding(true)
    try {
      await handleInningsComplete(state.total_runs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end innings')
      setEnding(false)
    }
  }

  function handleWicketResult(result: WicketResult) {
    setShowWicket(false)
    void recordBall({
      batterRuns: result.batterRuns,
      extraRuns: 0,
      extraType: null,
      isLegal: true,
      isWicket: true,
      wicketType: result.wicketType,
      dismissedPlayerId: result.dismissedPlayerId,
      fielderId: result.fielderId,
    })
  }

  function openExtraBallPicker(type: 'wide' | 'no_ball') {
    setExtraBallPicker(type)
    setExtraBallRuns(0)
    setExtraBallWicket(false)
  }

  function confirmExtraBallNoWicket() {
    if (!extraBallPicker) return
    const isWide = extraBallPicker === 'wide'
    void recordBall({
      // Wide: any runs taken are part of the wide extra, not batter runs.
      // No-ball: the +1 penalty is fixed extra; runs are credited to the batter.
      batterRuns: isWide ? 0 : extraBallRuns,
      extraRuns: isWide ? 1 + extraBallRuns : 1,
      extraType: extraBallPicker,
      isLegal: false,
      isWicket: false,
    })
    setExtraBallPicker(null)
  }

  function handleExtraBallWicketResult(result: WicketResult) {
    if (!extraBallPicker) return
    const isWide = extraBallPicker === 'wide'
    setExtraBallPicker(null)
    void recordBall({
      batterRuns: isWide ? 0 : result.batterRuns,
      extraRuns: isWide ? 1 + result.batterRuns : 1,
      extraType: extraBallPicker,
      isLegal: false,
      isWicket: true,
      wicketType: result.wicketType,
      dismissedPlayerId: result.dismissedPlayerId,
      fielderId: result.fielderId,
    })
  }

  function confirmNextBowler() {
    if (!nextBowlerId) return
    const cs = currentState()
    if (!canBowlNextOver(nextBowlerId, cs.last_bowler_id)) {
      setError(`${playerById(nextBowlerId)?.name} bowled the previous over. Choose a different bowler.`)
      return
    }
    setBowlerId(nextBowlerId)
    setNextBowlerId('')
    setOverEndState('idle')
    setError(null)
  }

  function confirmNextBatter() {
    if (!nextBatterId) return

    // Determine which end was vacated by checking the dismissal on the most
    // recent delivery — a run-out can dismiss either the striker or the
    // non-striker, and the new batter must take that specific end, not
    // always the striker's end.
    const lastDelivery = deliveries[deliveries.length - 1]
    const dismissedWasNonStriker =
      lastDelivery?.is_wicket && lastDelivery.dismissed_player_id === lastDelivery.non_striker_id

    if (dismissedWasNonStriker) {
      // Striker survives and keeps strike; new batter fills the non-striker's end
      setNonStrikerId(nextBatterId)
    } else {
      // Striker was dismissed (the common case); new batter takes strike
      setStrikerId(nextBatterId)
    }

    setNextBatterId('')
    setShowNextBatter(false)

    // After batter selection, check if over also ended
    const newState = computeInningsState(deliveries, battingPlayers.length, innings?.overs_limit ?? 10, innings?.target)
    if (newState.balls_in_current_over === 0 && newState.overs_completed > 0) {
      setOverEndState('needs_bowler')
    }
  }

  if (adminState === 'viewer') {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-zinc-400 text-sm mb-3">Live scoring is organiser-only. View the scorecard instead.</p>
        <button onClick={() => navigate(matchId ? `/match/${matchId}/scorecard` : '/')} className="text-emerald-400 text-sm">View Scorecard →</button>
      </div>
    )
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading innings…</div>

  if (error && !state) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <Link to={`/match/${matchId}`} className="text-emerald-400 text-sm">← Back to match</Link>
      </div>
    )
  }

  const cs = state ?? computeInningsState(deliveries, battingPlayers.length, innings?.overs_limit ?? 10, innings?.target)
  const striker = playerById(strikerId)
  const nonStriker = playerById(nonStrikerId)

  // Last 6 balls of current over for the mini-scorecard
  const currentOverDeliveries = deliveries.filter((d) => d.over_number === cs.overs_completed)

  return (
    <div className="flex flex-col flex-1 bg-zinc-950">
      {/* Scoreboard header */}
      <div className="bg-zinc-900 px-4 pt-6 pb-4">
        <div className="flex items-start justify-between mb-1">
          <Link to={`/match/${matchId}`} className="text-zinc-500 text-xs">← Match</Link>
          <div className="flex items-center gap-2">
            <Link
              to={`/match/${matchId}/scorecard`}
              className="text-xs text-zinc-300 border border-zinc-700 rounded px-2 py-1"
            >
              📊 Scorecard
            </Link>
            <button
              onClick={() => setShowEndInnings(true)}
              className="text-xs text-zinc-500 border border-zinc-700 rounded px-2 py-1"
            >
              End Innings
            </button>
          </div>
        </div>

        <div className="text-center mt-2">
          <div className="text-4xl font-bold text-white">
            {cs.total_runs}/{cs.wickets}
          </div>
          <div className="text-base text-zinc-400 mt-0.5">
            {oversDisplay(cs.overs_completed, cs.balls_in_current_over)} ov
            {innings?.target ? ` · Target: ${innings.target}` : ''}
          </div>
          {innings?.target && (
            <div className="text-sm text-emerald-400 mt-0.5">
              Need {innings.target - cs.total_runs} from {((innings.overs_limit - cs.overs_completed) * 6) - cs.balls_in_current_over} balls
            </div>
          )}
        </div>

        {/* Current over balls */}
        <div className="flex justify-center gap-1 mt-3 flex-wrap">
          {currentOverDeliveries.map((d, i) => {
            const extraRuns = d.extra_runs ?? 0
            const batterRuns = d.batter_runs ?? 0
            const isWide = d.extra_type === 'wide'
            const isNoBall = d.extra_type === 'no_ball'
            const isBye = d.extra_type === 'bye'
            const isLegBye = d.extra_type === 'leg_bye'
            const isBoundary = !isWide && !isNoBall && (d.total_runs === 4 || d.total_runs === 6)

            // Build label
            let label: string
            if (d.is_wicket) {
              label = isWide ? 'W(wd)' : isNoBall ? 'W(nb)' : 'W'
              if (batterRuns > 0) label += `+${batterRuns}`
            } else if (isWide) {
              label = extraRuns > 1 ? `wd+${extraRuns - 1}` : 'wd'
            } else if (isNoBall) {
              label = batterRuns > 0 ? `nb+${batterRuns}` : 'nb'
            } else if (isBye) {
              label = extraRuns > 0 ? `B${extraRuns}` : 'B'
            } else if (isLegBye) {
              label = extraRuns > 0 ? `LB${extraRuns}` : 'LB'
            } else {
              label = String(d.total_runs)
            }

            const isWide2 = label.length > 2
            const bgClass = d.is_wicket
              ? 'bg-red-500 text-white'
              : isWide
                ? 'bg-zinc-600 text-zinc-200'
                : isNoBall
                  ? 'bg-amber-500 text-zinc-950'
                  : isBye || isLegBye
                    ? 'bg-blue-600 text-white'
                    : isBoundary
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-zinc-700 text-zinc-200'

            return (
              <div
                key={i}
                className={`h-7 flex items-center justify-center text-[10px] font-bold ${bgClass} ${
                  isWide2 ? 'rounded-full px-1.5 min-w-[28px]' : 'w-7 rounded-full'
                }`}
              >
                {label}
              </div>
            )
          })}
          {Array.from({ length: Math.max(0, 6 - currentOverDeliveries.filter((d) => d.is_legal).length) }).map((_, i) => (
            <div key={`empty-${i}`} className="w-7 h-7 rounded-full border border-zinc-700" />
          ))}
        </div>
      </div>

      {/* Batters and bowler */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex gap-2 text-sm">
          <div className="flex-1">
            <div className="text-zinc-500 text-xs mb-1">Batting</div>
            {striker && (() => {
              const strikerStats = cs.batters.find((b: BatterStats) => b.player_id === strikerId)
              const isOut = strikerStats?.is_out ?? false
              return (
                <div className="flex items-center justify-between">
                  <span className={isOut ? "text-red-400" : "text-white font-medium"}>
                    {striker.name.split(' ')[0]} {isOut ? '†' : '*'}
                  </span>
                  <span className="text-zinc-400 text-xs">
                    {strikerStats?.runs ?? 0}({strikerStats?.balls ?? 0})
                  </span>
                </div>
              )
            })()}
            {nonStriker && (() => {
              const nonStrikerStats = cs.batters.find((b: BatterStats) => b.player_id === nonStrikerId)
              const isOut = nonStrikerStats?.is_out ?? false
              return (
                <div className="flex items-center justify-between mt-0.5">
                  <span className={isOut ? "text-red-400" : "text-zinc-400"}>
                    {nonStriker.name.split(' ')[0]} {isOut ? '†' : ''}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {nonStrikerStats?.runs ?? 0}({nonStrikerStats?.balls ?? 0})
                  </span>
                </div>
              )
            })()}
          </div>
          <div className="w-px bg-zinc-800" />
          <div className="flex-1 pl-2">
            <div className="text-zinc-500 text-xs mb-1">Bowling</div>
            {playerById(bowlerId) && (
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">{playerById(bowlerId)!.name.split(' ')[0]}</span>
                <span className="text-zinc-400 text-xs">
                  {(() => {
                    const b = cs.bowlers.find((x: BowlerStats) => x.player_id === bowlerId)
                    return b ? `${b.overs}.${b.balls} ov ${b.runs}r ${b.wickets}w` : ''
                  })()}
                </span>
              </div>
            )}
            {cs.next_ball_is_free_hit && (
              <div className="text-amber-400 text-xs mt-0.5 font-semibold">🔥 FREE HIT</div>
            )}
          </div>
        </div>
      </div>

      {/* Error strip */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between">
          <span className="text-red-400 text-xs">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 text-xs ml-2">✕</button>
        </div>
      )}

      {/* Over-end: pick next bowler */}
      {overEndState === 'needs_bowler' && (
        <div className="bg-zinc-900 border-b border-zinc-700 px-4 py-3">
          <p className="text-sm font-semibold text-white mb-2">Select next bowler</p>
          <select
            value={nextBowlerId}
            onChange={(e) => setNextBowlerId(e.target.value)}
            className="input text-sm mb-2"
          >
            <option value="">Select bowler</option>
            {bowlingPlayers.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === cs.last_bowler_id}>
                {p.name}{p.id === cs.last_bowler_id ? ' (bowled last over)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={confirmNextBowler}
            disabled={!nextBowlerId}
            className="w-full bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50"
          >
            Confirm Bowler
          </button>
        </div>
      )}

      {/* Wicket: pick next batter */}
      {showNextBatter && (
        <div className="bg-zinc-900 border-b border-zinc-700 px-4 py-3">
          <p className="text-sm font-semibold text-white mb-2">Select next batter</p>
          <select
            value={nextBatterId}
            onChange={(e) => setNextBatterId(e.target.value)}
            className="input text-sm mb-2"
          >
            <option value="">Select batter</option>
            {battingPlayers
              .filter((p) => {
                const b = cs.batters.find((x: BatterStats) => x.player_id === p.id)
                return !b?.is_out && p.id !== strikerId && p.id !== nonStrikerId
              })
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            }
          </select>
          <button
            onClick={confirmNextBatter}
            disabled={!nextBatterId}
            className="w-full bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50"
          >
            Confirm Batter
          </button>
        </div>
      )}

      {/* Bye / Leg Bye: pick runs */}
      {byePickerType && (
        <div className="bg-zinc-900 border-b border-zinc-700 px-4 py-3">
          <p className="text-sm font-semibold text-white mb-2">
            {byePickerType === 'bye' ? 'Bye' : 'Leg Bye'} — how many runs?
          </p>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => {
                  recordBall({ batterRuns: 0, extraRuns: r, extraType: byePickerType, isLegal: true, isWicket: false })
                  setByePickerType(null)
                }}
                className="py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white font-semibold text-base active:bg-zinc-700"
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => setByePickerType(null)}
            className="w-full bg-zinc-800 text-zinc-400 rounded-lg py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Wide / No Ball: pick additional runs, optionally mark a wicket */}
      {extraBallPicker && !extraBallWicket && (
        <div className="bg-zinc-900 border-b border-zinc-700 px-4 py-3">
          <p className="text-sm font-semibold text-white mb-2">
            {extraBallPicker === 'wide' ? 'Wide' : 'No Ball'} —{' '}
            {extraBallPicker === 'wide' ? 'runs taken (byes)?' : 'runs off the bat?'}
          </p>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button
                key={r}
                onClick={() => setExtraBallRuns(r)}
                className={`py-3 rounded-lg text-base font-semibold border ${
                  extraBallRuns === r
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                    : 'bg-zinc-800 text-white border-zinc-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button
              onClick={confirmExtraBallNoWicket}
              className="py-3 rounded-lg bg-emerald-500 active:bg-emerald-600 text-zinc-950 font-semibold text-sm"
            >
              Confirm ({1 + extraBallRuns} run{1 + extraBallRuns !== 1 ? 's' : ''})
            </button>
            <button
              onClick={() => setExtraBallWicket(true)}
              className="py-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 font-semibold text-sm"
            >
              + Wicket
            </button>
          </div>
          <button
            onClick={() => setExtraBallPicker(null)}
            className="w-full bg-zinc-800 text-zinc-400 rounded-lg py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Wide / No Ball wicket: filtered dismissal types per cricket law,
          further restricted to Run Out only if this ball is itself a free hit */}
      {extraBallPicker && extraBallWicket && striker && nonStriker && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={bowlingPlayers}
          wicketKeeperId={wicketKeeperId}
          allowedTypes={
            cs.next_ball_is_free_hit
              ? ['run_out']
              : extraBallPicker === 'no_ball'
                ? ['run_out']
                : ['run_out', 'stumped']
          }
          runsLabel={extraBallPicker === 'wide' ? 'Runs taken (byes) before the wicket' : 'Runs off the bat before the wicket'}
          onConfirm={handleExtraBallWicketResult}
          onCancel={() => setExtraBallWicket(false)}
        />
      )}

      {/* Scoring pad */}
      <div className="flex-1 px-4 pt-4 pb-6 flex flex-col gap-3">
        {/* Run buttons */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Runs</p>
          <div className="grid grid-cols-6 gap-1.5">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button
                key={r}
                onClick={() => recordBall({ batterRuns: r, extraRuns: 0, extraType: null, isLegal: true, isWicket: false })}
                disabled={saving || overEndState !== 'idle' || showNextBatter || !!byePickerType || !!extraBallPicker}
                className={`py-4 rounded-xl text-xl font-bold border transition-colors disabled:opacity-40 ${
                  r === 4
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 active:bg-emerald-500/20'
                    : r === 6
                      ? 'bg-emerald-500 text-zinc-950 border-emerald-500 active:bg-emerald-600'
                      : 'bg-zinc-800 text-white border-zinc-700 active:bg-zinc-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Extras row */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Extras</p>
          <div className="grid grid-cols-4 gap-1.5">
            <ExtraButton
              label="Wide"
              sublabel="tap to score"
              disabled={saving || overEndState !== 'idle' || showNextBatter || !!byePickerType || !!extraBallPicker}
              onClick={() => openExtraBallPicker('wide')}
            />
            <ExtraButton
              label="No Ball"
              sublabel="tap to score"
              disabled={saving || overEndState !== 'idle' || showNextBatter || !!byePickerType || !!extraBallPicker}
              onClick={() => openExtraBallPicker('no_ball')}
            />
            <ExtraButton
              label="Bye"
              sublabel="runs?"
              disabled={saving || overEndState !== 'idle' || showNextBatter || !!byePickerType || !!extraBallPicker}
              onClick={() => setByePickerType('bye')}
            />
            <ExtraButton
              label="Leg Bye"
              sublabel="runs?"
              disabled={saving || overEndState !== 'idle' || showNextBatter || !!byePickerType || !!extraBallPicker}
              onClick={() => setByePickerType('leg_bye')}
            />
          </div>
        </div>

        {/* Wicket + Undo */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setShowWicket(true)}
            disabled={saving || overEndState !== 'idle' || showNextBatter || !!byePickerType || !!extraBallPicker || !striker || !nonStriker}
            className="py-3.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 font-bold text-base active:bg-red-500/20 disabled:opacity-40"
          >
            Wicket
          </button>
          <button
            onClick={handleUndo}
            disabled={saving || deliveries.length === 0}
            className="py-3.5 rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium text-sm active:bg-zinc-700 disabled:opacity-40"
          >
            ↩ Undo
          </button>
        </div>
      </div>

      {/* Wicket modal */}
      {showWicket && striker && nonStriker && (
        <WicketModal
          striker={striker}
          nonStriker={nonStriker}
          fieldingPlayers={bowlingPlayers}
          wicketKeeperId={wicketKeeperId}
          allowedTypes={cs.next_ball_is_free_hit ? ['run_out'] : undefined}
          onConfirm={handleWicketResult}
          onCancel={() => setShowWicket(false)}
        />
      )}

      {/* End innings confirmation */}
      {showEndInnings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-white mb-2">End Innings?</h3>
            <p className="text-sm text-zinc-400 mb-5">
              Current score: {cs.total_runs}/{cs.wickets} in {oversDisplay(cs.overs_completed, cs.balls_in_current_over)} overs.
              This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEndInningsManually}
                disabled={ending}
                className="flex-1 bg-red-500 text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-50"
              >
                {ending ? 'Ending…' : 'Yes, End Innings'}
              </button>
              <button
                onClick={() => setShowEndInnings(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 rounded-xl py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExtraButton({
  label, sublabel, disabled, onClick,
}: {
  label: string
  sublabel: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-center disabled:opacity-40 active:bg-zinc-700"
    >
      <div className="text-sm font-semibold text-zinc-200">{label}</div>
      <div className="text-xs text-zinc-500">{sublabel}</div>
    </button>
  )
}
