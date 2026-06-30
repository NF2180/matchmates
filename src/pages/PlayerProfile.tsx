import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Player } from '../types'
import type { CareerStats } from '../lib/careerStats'

export default function PlayerProfile() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<CareerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', id)
        .single()
      if (playerError) throw playerError
      setPlayer(playerData as Player)

      const { data: statsData } = await supabase
        .from('player_career_stats')
        .select('*')
        .eq('player_id', id)
        .maybeSingle()
      setStats((statsData as CareerStats) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (playerId) loadAll(playerId)
  }, [playerId, loadAll])

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  }

  if (error || !player) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error ?? 'Player not found'}</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  const initials = player.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="text-sm text-zinc-500 mb-3 inline-block">← Back</button>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-400">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{player.name}</h1>
            {player.mobile_number && !player.mobile_number.startsWith('guest_') && (
              <p className="text-sm text-zinc-500 mt-0.5">{player.mobile_number}</p>
            )}
          </div>
        </div>
      </header>

      {!stats ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          <p className="text-zinc-500 text-sm">No career stats yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Stats are recorded after matches are completed.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <BattingCard stats={stats} />
          <BowlingCard stats={stats} />
          <FieldingCard stats={stats} />
        </div>
      )}
    </div>
  )
}

function BattingCard({ stats }: { stats: CareerStats }) {
  const innings = stats.matches_batted
  const dismissals = innings - stats.not_outs
  const avg = dismissals > 0 ? (stats.runs / dismissals).toFixed(2) : stats.runs > 0 ? '∞' : '—'
  const sr = stats.balls_faced > 0 ? ((stats.runs / stats.balls_faced) * 100).toFixed(1) : '—'

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Batting</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCell label="Mat" value={stats.matches_batted} />
          <StatCell label="Runs" value={stats.runs} highlight />
          <StatCell label="HS" value={stats.highest_score} />
          <StatCell label="Avg" value={avg} />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <StatCell label="SR" value={sr} />
          <StatCell label="50s" value={stats.fifties} />
          <StatCell label="100s" value={stats.hundreds} />
          <StatCell label="NO" value={stats.not_outs} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-zinc-800">
          <StatCell label="4s" value={stats.fours} />
          <StatCell label="6s" value={stats.sixes} />
        </div>
      </div>
    </section>
  )
}

function BowlingCard({ stats }: { stats: CareerStats }) {
  const avg = stats.wickets > 0 ? (stats.runs_conceded / stats.wickets).toFixed(2) : '—'
  const econ = stats.balls_bowled > 0
    ? (stats.runs_conceded / (stats.balls_bowled / 6)).toFixed(2)
    : '—'
  const overs = `${Math.floor(stats.balls_bowled / 6)}.${stats.balls_bowled % 6}`
  const best = stats.best_wickets > 0 ? `${stats.best_wickets}/${stats.best_runs}` : '—'

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Bowling</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCell label="Mat" value={stats.matches_bowled} />
          <StatCell label="Wkts" value={stats.wickets} highlight />
          <StatCell label="Runs" value={stats.runs_conceded} />
          <StatCell label="Overs" value={overs} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="Avg" value={avg} />
          <StatCell label="Econ" value={econ} />
          <StatCell label="Best" value={best} />
        </div>
      </div>
    </section>
  )
}

function FieldingCard({ stats }: { stats: CareerStats }) {
  const total = stats.catches + stats.run_outs + stats.stumpings
  if (total === 0) return null

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Fielding</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="Catches" value={stats.catches} />
          <StatCell label="Run Outs" value={stats.run_outs} />
          <StatCell label="Stumpings" value={stats.stumpings} />
        </div>
      </div>
    </section>
  )
}

function StatCell({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  )
}
