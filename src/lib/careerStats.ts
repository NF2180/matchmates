import { supabase } from './supabase'

export interface CareerStats {
  player_id: string
  // Batting
  matches_batted: number
  runs: number
  balls_faced: number
  highest_score: number
  fours: number
  sixes: number
  fifties: number
  hundreds: number
  not_outs: number
  // Bowling
  matches_bowled: number
  wickets: number
  runs_conceded: number
  balls_bowled: number
  best_wickets: number
  best_runs: number
  // Fielding
  catches: number
  run_outs: number
  stumpings: number
}

interface RawDelivery {
  innings_id: string
  striker_id: string
  non_striker_id: string
  bowler_id: string
  batter_runs: number
  extra_runs: number
  extra_type: string | null
  is_legal: boolean
  is_wicket: boolean
  wicket_type: string | null
  dismissed_player_id: string | null
  fielder_id: string | null
}

interface InningsInfo {
  id: string
  batting_team_id: string
  bowling_team_id: string
}

/**
 * Recomputes career stats for a single player by scanning all their
 * deliveries across all completed innings. Called after match completion.
 */
export async function recomputeCareerStats(playerId: string): Promise<void> {
  // Load all deliveries where this player appeared as striker, non-striker, bowler, or fielder
  const { data: deliveries, error } = await supabase
    .from('deliveries')
    .select(`
      innings_id,
      striker_id,
      non_striker_id,
      bowler_id,
      batter_runs,
      extra_runs,
      extra_type,
      is_legal,
      is_wicket,
      wicket_type,
      dismissed_player_id,
      fielder_id,
      innings!inner(id, batting_team_id, bowling_team_id, status)
    `)
    .or(`striker_id.eq.${playerId},non_striker_id.eq.${playerId},bowler_id.eq.${playerId},fielder_id.eq.${playerId}`)
    .eq('innings.status', 'completed')

  if (error || !deliveries) return

  // Group deliveries by innings
  const byInnings = new Map<string, RawDelivery[]>()

  for (const d of deliveries as (RawDelivery & { innings: InningsInfo[] })[]) {
    const list = byInnings.get(d.innings_id) ?? []
    list.push(d)
    byInnings.set(d.innings_id, list)
  }

  // Aggregate across all innings
  const stats: CareerStats = {
    player_id: playerId,
    matches_batted: 0,
    runs: 0,
    balls_faced: 0,
    highest_score: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    not_outs: 0,
    matches_bowled: 0,
    wickets: 0,
    runs_conceded: 0,
    balls_bowled: 0,
    best_wickets: 0,
    best_runs: 0,
    catches: 0,
    run_outs: 0,
    stumpings: 0,
  }

  // Track which matches we've already counted (to avoid double-counting from multiple innings in same match)
  const battedMatchInnings = new Set<string>()
  const bowledMatchInnings = new Set<string>()

  for (const [inningsId, balls] of byInnings.entries()) {

    // ---- BATTING ----
    const battingBalls = balls.filter(
      (d) => d.striker_id === playerId && d.is_legal
    )
    if (battingBalls.length > 0 && !battedMatchInnings.has(inningsId)) {
      battedMatchInnings.add(inningsId)
      stats.matches_batted++

      let inningsRuns = 0
      for (const d of battingBalls) {
        inningsRuns += d.batter_runs
        stats.runs += d.batter_runs
        stats.balls_faced++
        if (d.batter_runs === 4) stats.fours++
        if (d.batter_runs === 6) stats.sixes++
      }

      // Check if dismissed in this innings
      const wasDismissed = balls.some(
        (d) => d.is_wicket && d.dismissed_player_id === playerId &&
          d.wicket_type !== 'retired_hurt'
      )
      if (!wasDismissed) stats.not_outs++

      if (inningsRuns > stats.highest_score) stats.highest_score = inningsRuns
      if (inningsRuns >= 100) stats.hundreds++
      else if (inningsRuns >= 50) stats.fifties++
    }

    // ---- BOWLING ----
    const bowlingBalls = balls.filter((d) => d.bowler_id === playerId)
    if (bowlingBalls.length > 0 && !bowledMatchInnings.has(inningsId)) {
      bowledMatchInnings.add(inningsId)
      stats.matches_bowled++

      let inningsWickets = 0
      let inningsRunsConceded = 0

      for (const d of bowlingBalls) {
        if (d.is_legal) stats.balls_bowled++

        // Runs conceded by bowler: for no-ball = extra + batter runs; for wide = extra; for normal = batter runs
        if (d.extra_type === 'no_ball') {
          inningsRunsConceded += d.extra_runs + d.batter_runs
        } else if (d.extra_type === 'wide') {
          inningsRunsConceded += d.extra_runs
        } else if (!d.extra_type || d.extra_type === 'overthrow') {
          inningsRunsConceded += d.batter_runs
        }
        // byes and leg_byes don't count against the bowler

        // Wickets credited to bowler (not run-outs, not retired hurt)
        if (
          d.is_wicket &&
          d.bowler_id === playerId &&
          d.wicket_type !== 'run_out' &&
          d.wicket_type !== 'retired_hurt'
        ) {
          inningsWickets++
        }
      }

      stats.wickets += inningsWickets
      stats.runs_conceded += inningsRunsConceded

      // Best bowling figures: more wickets = better; on equal wickets, fewer runs = better
      if (
        inningsWickets > stats.best_wickets ||
        (inningsWickets === stats.best_wickets && inningsRunsConceded < stats.best_runs)
      ) {
        stats.best_wickets = inningsWickets
        stats.best_runs = inningsRunsConceded
      }
    }

    // ---- FIELDING ----
    for (const d of balls) {
      if (!d.is_wicket || d.fielder_id !== playerId) continue
      if (d.wicket_type === 'caught') stats.catches++
      else if (d.wicket_type === 'run_out') stats.run_outs++
      else if (d.wicket_type === 'stumped') stats.stumpings++
    }
  }

  // Upsert into career stats table
  await supabase
    .from('player_career_stats')
    .upsert(
      { ...stats, last_updated: new Date().toISOString() },
      { onConflict: 'player_id' }
    )
}

/**
 * Recomputes career stats for ALL players who appeared in a given match.
 * Called immediately after completeMatch().
 */
export async function recomputeCareerStatsForMatch(matchId: string): Promise<void> {
  const { data: participations } = await supabase
    .from('participation')
    .select('player_id')
    .eq('match_id', matchId)

  if (!participations) return

  const playerIds = [...new Set(participations.map((p) => p.player_id))]
  await Promise.all(playerIds.map((id) => recomputeCareerStats(id)))
}
