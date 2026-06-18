import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Match } from '../types'

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMatches() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('matches')
        .select('*, ground:grounds(*)')
        .order('match_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        setError(error.message)
      } else {
        setMatches(data as Match[])
      }
      setLoading(false)
    }
    loadMatches()
  }, [])

  return (
    <div className="flex flex-col flex-1 px-4 pb-24">
      <header className="pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">MatchMates</h1>
          <p className="text-sm text-zinc-400">Cricket, organized.</p>
        </div>
      </header>

      <Link
        to="/create"
        className="w-full bg-emerald-500 active:bg-emerald-600 text-zinc-950 font-semibold rounded-xl py-3.5 text-center text-base shadow-lg shadow-emerald-500/20 mb-6"
      >
        + Create Match
      </Link>

      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Recent Matches
      </h2>

      {loading && (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading matches…</div>
      )}

      {error && (
        <div className="text-red-400 text-sm py-4 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="text-zinc-500 text-sm py-8 text-center border border-dashed border-zinc-700 rounded-xl">
          No matches yet. Create your first one above.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {matches.map((match) => (
          <Link
            key={match.id}
            to={`/match/${match.id}`}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 active:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">{match.match_name}</span>
              <StatusBadge status={match.status} />
            </div>
            <div className="text-sm text-zinc-400 flex items-center gap-2">
              <span>{formatDate(match.match_date)}</span>
              {match.match_time && <span>· {formatTime(match.match_time)}</span>}
            </div>
            {match.ground?.name && (
              <div className="text-xs text-zinc-500 mt-1">📍 {match.ground.name}</div>
            )}
            <div className="text-xs text-zinc-600 mt-2 font-mono">{match.match_code}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    created: 'bg-blue-500/15 text-blue-400',
    live: 'bg-emerald-500/15 text-emerald-400',
    completed: 'bg-zinc-500/15 text-zinc-400',
    cancelled: 'bg-red-500/15 text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? styles.created}`}>
      {status}
    </span>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${m} ${ampm}`
}
