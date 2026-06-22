/**
 * Cricket scoring engine — pure logic, no Supabase calls.
 * All state is derived from the deliveries array; nothing is cached.
 */

export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'overthrow'
export type WicketType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket'
  | 'retired_hurt'

export interface Delivery {
  id: string
  over_number: number
  ball_number: number   // legal ball index within over
  is_legal: boolean
  striker_id: string
  non_striker_id: string
  bowler_id: string
  batter_runs: number
  extra_runs: number
  total_runs: number
  extra_type: ExtraType | null
  is_free_hit: boolean
  is_wicket: boolean
  wicket_type: WicketType | null
  dismissed_player_id: string | null
  fielder_id: string | null
}

export interface BatterStats {
  player_id: string
  runs: number
  balls: number
  fours: number
  sixes: number
  is_out: boolean
  wicket_type: WicketType | null
  bowler_id: string | null
  fielder_id: string | null
  batting_position: number
}

export interface BowlerStats {
  player_id: string
  overs: number          // completed overs
  balls: number          // balls in current partial over
  runs: number           // runs conceded (excludes byes/leg byes)
  wickets: number
  wides: number
  no_balls: number
}

export interface ExtrasBreakdown {
  wides: number
  no_balls: number
  byes: number
  leg_byes: number
  overthrows: number
  total: number
}

export interface InningsState {
  total_runs: number
  wickets: number
  overs_completed: number
  balls_in_current_over: number
  current_striker_id: string | null
  current_non_striker_id: string | null
  current_bowler_id: string | null
  last_bowler_id: string | null          // bowler who bowled previous over
  next_ball_is_free_hit: boolean
  batters: BatterStats[]
  bowlers: BowlerStats[]
  extras: ExtrasBreakdown
  fall_of_wickets: Array<{ wicket: number; runs: number; over: string; player_id: string }>
  is_complete: boolean
  balls_bowled_total: number             // legal deliveries only
}

/**
 * Derives complete innings state from the raw deliveries array.
 * Recomputed from scratch on every ball — this is intentional:
 * it avoids stale state bugs and makes the engine trivially correct.
 * Performance is fine for casual match sizes (< 500 deliveries).
 */
export function computeInningsState(
  deliveries: Delivery[],
  teamSize: number,
  oversLimit: number,
  target?: number | null
): InningsState {
  const state: InningsState = {
    total_runs: 0,
    wickets: 0,
    overs_completed: 0,
    balls_in_current_over: 0,
    current_striker_id: null,
    current_non_striker_id: null,
    current_bowler_id: null,
    last_bowler_id: null,
    next_ball_is_free_hit: false,
    batters: [],
    bowlers: [],
    extras: { wides: 0, no_balls: 0, byes: 0, leg_byes: 0, overthrows: 0, total: 0 },
    fall_of_wickets: [],
    is_complete: false,
    balls_bowled_total: 0,
  }

  const batterMap = new Map<string, BatterStats>()
  const bowlerMap = new Map<string, BowlerStats>()
  const bowlerByOver = new Map<number, string>() // over_number -> bowler_id
  let battingPosition = 1

  for (const d of deliveries) {
    // Track batting positions
    if (!batterMap.has(d.striker_id)) {
      batterMap.set(d.striker_id, {
        player_id: d.striker_id,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        is_out: false, wicket_type: null, bowler_id: null, fielder_id: null,
        batting_position: battingPosition++,
      })
    }
    if (!batterMap.has(d.non_striker_id)) {
      batterMap.set(d.non_striker_id, {
        player_id: d.non_striker_id,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        is_out: false, wicket_type: null, bowler_id: null, fielder_id: null,
        batting_position: battingPosition++,
      })
    }

    // Track which bowler bowled each over (last delivery in an over_number wins,
    // which is always correct since a bowler doesn't change mid-over)
    bowlerByOver.set(d.over_number, d.bowler_id)

    // Bowler stats init
    if (!bowlerMap.has(d.bowler_id)) {
      bowlerMap.set(d.bowler_id, {
        player_id: d.bowler_id,
        overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, no_balls: 0,
      })
    }
    const bowler = bowlerMap.get(d.bowler_id)!

    // Totals
    state.total_runs += d.total_runs

    // Extras breakdown
    if (d.extra_type === 'wide') {
      state.extras.wides += d.extra_runs
      state.extras.total += d.extra_runs
      bowler.runs += d.extra_runs
      bowler.wides++
    } else if (d.extra_type === 'no_ball') {
      state.extras.no_balls += d.extra_runs
      state.extras.total += d.extra_runs
      // Bowler concedes the no-ball penalty AND any runs the batter hits off it —
      // the whole delivery is the bowler's fault, so all runs count against their figures.
      bowler.runs += d.extra_runs + d.batter_runs
      bowler.no_balls++
      // batter runs on no-ball still credited to batter
      const batter = batterMap.get(d.striker_id)!
      batter.runs += d.batter_runs
      if (d.batter_runs === 4) batter.fours++
      if (d.batter_runs === 6) batter.sixes++
    } else if (d.extra_type === 'bye') {
      state.extras.byes += d.extra_runs
      state.extras.total += d.extra_runs
      // byes NOT credited to bowler's runs
    } else if (d.extra_type === 'leg_bye') {
      state.extras.leg_byes += d.extra_runs
      state.extras.total += d.extra_runs
      // leg byes NOT credited to bowler's runs
    } else if (d.extra_type === 'overthrow') {
      state.extras.overthrows += d.extra_runs
      state.extras.total += d.extra_runs
      bowler.runs += d.extra_runs
    } else {
      // Normal delivery — credit to batter and bowler
      const batter = batterMap.get(d.striker_id)!
      batter.runs += d.batter_runs
      if (d.batter_runs === 4) batter.fours++
      if (d.batter_runs === 6) batter.sixes++
      bowler.runs += d.batter_runs
    }

    // Legal delivery ball counts
    if (d.is_legal) {
      state.balls_bowled_total++
      bowler.balls++
      if (bowler.balls === 6) {
        bowler.overs++
        bowler.balls = 0
      }
      const batter = batterMap.get(d.striker_id)!
      batter.balls++
    }

    // Wicket
    if (d.is_wicket && d.dismissed_player_id) {
      state.wickets++
      const dismissed = batterMap.get(d.dismissed_player_id)
      if (dismissed) {
        dismissed.is_out = true
        dismissed.wicket_type = d.wicket_type
        dismissed.bowler_id = d.bowler_id
        dismissed.fielder_id = d.fielder_id
      }
      // Bowler credited with wicket (except run out)
      if (d.wicket_type !== 'run_out') {
        bowler.wickets++
      }
      state.fall_of_wickets.push({
        wicket: state.wickets,
        runs: state.total_runs,
        over: overString(d.over_number, d.ball_number),
        player_id: d.dismissed_player_id,
      })
    }

    // Strike rotation
    if (d.is_legal) {
      const runsForStrike = d.batter_runs + (d.extra_type === 'bye' || d.extra_type === 'leg_bye' ? d.extra_runs : 0)
      if (runsForStrike % 2 === 1) {
        // Odd runs — strike changes
        const temp = d.striker_id
        state.current_striker_id = d.non_striker_id
        state.current_non_striker_id = temp
      } else {
        state.current_striker_id = d.striker_id
        state.current_non_striker_id = d.non_striker_id
      }
    }

    // Free hit tracking
    state.next_ball_is_free_hit = d.extra_type === 'no_ball'
  }

  // Compute overs from balls
  state.overs_completed = Math.floor(state.balls_bowled_total / 6)
  state.balls_in_current_over = state.balls_bowled_total % 6

  // End of over: rotate strike
  if (state.balls_in_current_over === 0 && state.overs_completed > 0 && deliveries.length > 0) {
    // At over end, ends swap — current striker becomes non-striker and vice versa
    const s = state.current_striker_id
    state.current_striker_id = state.current_non_striker_id
    state.current_non_striker_id = s
  }

  // Bowler history for consecutive-over enforcement.
  // current_bowler_id: whoever bowled the most recent ball (mid-over, or the
  // over that just finished, if we're sitting exactly on an over boundary).
  // last_bowler_id: whoever bowled the most recently COMPLETED over — this is
  // what the "can't bowl two overs in a row" check should compare the next
  // over's prospective bowler against. Only meaningful once at least one
  // over is complete and we're at an over boundary (about to start a new one).
  if (deliveries.length > 0) {
    const lastDelivery = deliveries[deliveries.length - 1]
    state.current_bowler_id = lastDelivery.bowler_id

    if (state.balls_in_current_over === 0 && state.overs_completed > 0) {
      // sitting at an over boundary — the over that just completed is overs_completed - 1
      state.last_bowler_id = bowlerByOver.get(state.overs_completed - 1) ?? null
    } else {
      // mid-over — the "last completed over" is the one before the current one
      state.last_bowler_id = bowlerByOver.get(state.overs_completed - 1) ?? null
    }
  }

  state.batters = Array.from(batterMap.values()).sort((a, b) => a.batting_position - b.batting_position)
  state.bowlers = Array.from(bowlerMap.values())

  // Innings complete?
  const maxWickets = teamSize - 1
  state.is_complete =
    state.wickets >= maxWickets ||
    state.overs_completed >= oversLimit ||
    (target != null && target > 0 && state.total_runs >= target)

  return state
}

/** Formats over number as "3.2" (over 3, ball 2) */
export function overString(overNum: number, ballNum: number): string {
  return `${overNum}.${ballNum}`
}

/** Human-readable overs display: "3.2 ov" */
export function oversDisplay(overs: number, balls: number): string {
  return `${overs}.${balls}`
}

/** Check if a bowler bowled the previous over (consecutive over rule) */
export function canBowlNextOver(bowlerId: string, lastBowlerId: string | null): boolean {
  return bowlerId !== lastBowlerId
}

/**
 * Builds a new Delivery object ready for insert.
 * Caller is responsible for persisting to Supabase.
 */
export interface DeliveryInput {
  inningsId: string
  matchId: string
  inningsNumber: number
  overNumber: number
  ballNumber: number
  isLegal: boolean
  strikerId: string
  nonStrikerId: string
  bowlerId: string
  batterRuns: number
  extraRuns: number
  extraType: ExtraType | null
  isFreehit: boolean
  isWicket: boolean
  wicketType: WicketType | null
  dismissedPlayerId: string | null
  fielderId: string | null
}

export function buildDelivery(input: DeliveryInput): Omit<Delivery, 'id'> & {
  innings_id: string
  match_id: string
  innings_number: number
} {
  return {
    innings_id: input.inningsId,
    match_id: input.matchId,
    innings_number: input.inningsNumber,
    over_number: input.overNumber,
    ball_number: input.ballNumber,
    is_legal: input.isLegal,
    striker_id: input.strikerId,
    non_striker_id: input.nonStrikerId,
    bowler_id: input.bowlerId,
    batter_runs: input.batterRuns,
    extra_runs: input.extraRuns,
    total_runs: input.batterRuns + input.extraRuns,
    extra_type: input.extraType,
    is_free_hit: input.isFreehit,
    is_wicket: input.isWicket,
    wicket_type: input.wicketType,
    dismissed_player_id: input.dismissedPlayerId,
    fielder_id: input.fielderId,
  }
}
