import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Match } from '../types'

interface MatchWithInnings extends Match {
  innings?: Array<{
    id: string
    innings_number: number
    status: string
    batting_team_id: string
    bowling_team_id: string
    overs_limit: number
    target: number | null
  }>
  teamNames?: Record<string, string>
}

interface DateGroup {
  date: string
  matches: MatchWithInnings[]
}

export default function Home() {
  const [groups, setGroups] = useState<DateGroup[]>([])
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
        .limit(100)

      if (error) { setError(error.message); setLoading(false); return }

      const matches = (data as MatchWithInnings[]) ?? []

      // Load innings and team names for completed/live matches
      for (const match of matches) {
        if (match.status === 'completed' || match.status === 'live') {
          const { data: innings } = await supabase
            .from('innings')
            .select('id, innings_number, status, batting_team_id, bowling_team_id, overs_limit, target')
            .eq('match_id', match.id)
            .order('innings_number', { ascending: true })
          match.innings = innings ?? []

          if (match.innings.length > 0) {
            const teamIds = [...new Set(match.innings.flatMap((i) => [i.batting_team_id, i.bowling_team_id]))]
            const { data: teams } = await supabase
              .from('teams')
              .select('id, name')
              .in('id', teamIds)
            match.teamNames = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]))
          }
        }
      }

      // Group by date, ordered most recent first
      const byDate = new Map<string, MatchWithInnings[]>()
      for (const match of matches) {
        const list = byDate.get(match.match_date) ?? []
        // Within a date, sort ascending by created_at so Game 1 = earliest
        list.push(match)
        byDate.set(match.match_date, list)
      }

      const grouped: DateGroup[] = Array.from(byDate.entries()).map(([date, ms]) => ({
        date,
        matches: [...ms].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))

      setGroups(grouped)
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

      {loading && <div className="text-zinc-500 text-sm py-8 text-center">Loading matches…</div>}

      {error && (
        <div className="text-red-400 text-sm py-4 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="text-zinc-500 text-sm py-8 text-center border border-dashed border-zinc-700 rounded-xl">
          No matches yet. Create your first one above.
        </div>
      )}

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.date}>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              {formatDate(group.date)}
            </h2>
            <div className="flex flex-col gap-2">
              {group.matches.map((match, i) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  gameNumber={group.matches.length > 1 ? i + 1 : null}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Link to="/admin/players" className="text-xs text-zinc-600 text-center mt-8 mb-2">
        Admin · Manage Players
      </Link>
    </div>
  )
}

function MatchCard({ match, gameNumber }: { match: MatchWithInnings; gameNumber: number | null }) {
  const result = getResultText(match)

  return (
    <Link
      to={`/match/${match.id}`}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 active:bg-zinc-800 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          {gameNumber && (
            <span className="text-xs text-emerald-400 font-semibold shrink-0">
              Game {gameNumber}
            </span>
          )}
          <span className="font-semibold text-white truncate">{match.match_name}</span>
        </div>
        <StatusBadge status={match.status} />
      </div>

      {match.match_time && (
        <div className="text-xs text-zinc-500 mt-0.5">{formatTime(match.match_time)}</div>
      )}

      {match.ground?.name && (
        <div className="text-xs text-zinc-500 mt-0.5">📍 {match.ground.name}</div>
      )}

      {result && (
        <div className="text-xs text-emerald-400 font-medium mt-1.5">{result}</div>
      )}

      {!result && match.innings && match.innings.length > 0 && (
        <div className="text-xs text-zinc-500 mt-1.5">
          {match.innings.map((inn) => {
            const teamName = match.teamNames?.[inn.batting_team_id] ?? 'Team'
            return (
              <span key={inn.id} className="mr-3">
                {teamName}: {inn.status === 'active' ? 'batting…' : 'completed'}
              </span>
            )
          })}
        </div>
      )}
    </Link>
  )
}

function getResultText(match: MatchWithInnings): string | null {
  if (match.result_summary) return `🏆 ${match.result_summary}`
  if (match.status === 'live' && match.innings && match.innings.length > 0) {
    const activeInn = match.innings.find((i) => i.status === 'active')
    if (activeInn) {
      const teamName = match.teamNames?.[activeInn.batting_team_id] ?? 'Team'
      return `${teamName} batting`
    }
  }
  return null
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    created: 'bg-blue-500/15 text-blue-400',
    live: 'bg-emerald-500/15 text-emerald-400',
    completed: 'bg-zinc-500/15 text-zinc-400',
    cancelled: 'bg-red-500/15 text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${styles[status] ?? styles.created}`}>
      {status}
    </span>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${m} ${ampm}`
}
