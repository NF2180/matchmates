import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdminAccess } from '../hooks/useAdminAccess'
import type { Match, Event, Participation } from '../types'

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [match, setMatch] = useState<Match | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participation[]>([])
  const [loading, setLoading] = useState(true)

  // Admin access is checked at event level
  const [eventId, setEventId] = useState<string | undefined>()
  const adminState = useAdminAccess(eventId)
  const isAdmin = adminState === 'admin'

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: m } = await supabase.from('matches').select('*').eq('id', id).single()
      if (!m) { setLoading(false); return }
      setMatch(m as Match)
      setEventId(m.event_id)

      const { data: ev } = await supabase.from('events').select('*').eq('id', m.event_id).single()
      setEvent(ev as Event)

      const { data: parts } = await supabase.from('participation').select('*, player:players(*)').eq('event_id', m.event_id)
      setParticipants((parts as Participation[]) ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (!match || !event) return (
    <div className="px-4 py-12 text-center">
      <p className="text-red-400 text-sm mb-3">Match not found</p>
      <Link to="/" className="text-emerald-400 text-sm">← Back</Link>
    </div>
  )

  const playing = participants.filter((p) => p.status === 'playing')

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/event/${event.id}`} className="text-sm text-zinc-500 mb-2 inline-block">← {event.event_name}</Link>
        <h1 className="text-xl font-bold text-white">{match.match_name}</h1>
        {match.result_summary && (
          <div className="mt-2 text-sm font-semibold text-emerald-400">🏆 {match.result_summary}</div>
        )}
        {match.status === 'live' && !match.result_summary && (
          <div className="mt-1 text-sm text-emerald-400">● Live</div>
        )}
      </header>

      {/* Scoring */}
      {isAdmin && match.status === 'live' && match.current_innings_id ? (
        <Link to={`/match/${id}/scoring/${match.current_innings_id}`}
          className="w-full bg-emerald-500 text-zinc-950 font-bold rounded-xl py-3.5 text-center text-base mb-3 flex items-center justify-center gap-2">
          🏏 Resume Scoring
        </Link>
      ) : isAdmin && match.status === 'created' && match.batting_first_team_id ? (
        <Link to={`/match/${id}/innings/1`}
          className="w-full bg-emerald-500 text-zinc-950 font-bold rounded-xl py-3.5 text-center text-base mb-3 flex items-center justify-center gap-2">
          🏏 Start Innings 1
        </Link>
      ) : isAdmin && match.status === 'created' ? (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl py-3 text-center text-xs text-zinc-500 mb-3">
          Set up teams and toss to start scoring
        </div>
      ) : match.status === 'completed' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-3 text-center text-xs text-zinc-500 mb-3">Match completed</div>
      ) : null}

      {/* Scorecard */}
      {(match.status === 'live' || match.status === 'completed') && (
        <div className="flex gap-2 mb-3">
          <Link to={`/match/${id}/scorecard`}
            className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium rounded-xl py-3 text-center text-sm">
            📊 Scorecard
          </Link>
          <a href={`https://wa.me/?text=${encodeURIComponent(`🏏 ${match.match_name} — Live Score\n${window.location.origin}${window.location.pathname}#/match/${id}/scorecard`)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 bg-green-600 text-white font-medium rounded-xl py-3 text-center text-sm">
            📤 Share
          </a>
        </div>
      )}

      {/* Team setup */}
      {isAdmin && (
        <Link to={`/match/${id}/teams`}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3 flex items-center justify-between active:bg-zinc-800">
          <div>
            <div className="font-semibold text-white text-sm">Teams & Toss</div>
            <div className="text-xs text-zinc-500 mt-0.5">Assign teams, roles, who bats first</div>
          </div>
          <span className="text-zinc-500">→</span>
        </Link>
      )}

      {/* Players in this event */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3">
        <div className="text-sm font-semibold text-white mb-2">Players ({playing.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {playing.map((p) => (
            <span key={p.id} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-full">{p.player?.name}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
