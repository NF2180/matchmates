import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/matchUtils'
import type { Event, Match } from '../types'

interface EventWithMatches extends Event {
  matches: Match[]
}

export default function Home() {
  const [events, setEvents] = useState<EventWithMatches[]>([])
  const [loading, setLoading] = useState(true)

  async function loadEvents() {
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false })
      .limit(30)

    if (!eventsData) { setLoading(false); return }

    const eventIds = eventsData.map((e) => e.id)
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*')
      .in('event_id', eventIds)
      .order('game_number', { ascending: true })

    const matchesByEvent: Record<string, Match[]> = {}
    for (const m of (matchesData ?? [])) {
      if (!matchesByEvent[m.event_id]) matchesByEvent[m.event_id] = []
      matchesByEvent[m.event_id].push(m as Match)
    }

    setEvents(eventsData.map((e) => ({ ...e, matches: matchesByEvent[e.id] ?? [] } as EventWithMatches)))
    setLoading(false)
  }

  useEffect(() => { loadEvents() }, [])

  async function deleteEvent(eventId: string) {
    await supabase.from('events').delete().eq('id', eventId)
    setEvents((prev) => prev.filter((e) => e.id !== eventId))
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">🏏 MatchMates</h1>
        <Link to="/admin/players" className="text-xs text-zinc-500 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg">Players</Link>
      </header>

      <Link to="/event/create" className="w-full bg-emerald-500 text-zinc-950 font-semibold rounded-xl py-3.5 text-center text-base mb-6">
        + New Match Day
      </Link>

      {events.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">No match days yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Tap "+ New Match Day" to get started.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} onDelete={deleteEvent} />
        ))}
      </div>
    </div>
  )
}

function EventCard({ event, onDelete }: { event: EventWithMatches; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-stretch gap-2">
      <Link to={`/event/${event.id}`} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-4 active:bg-zinc-800 block">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-white">{event.event_name}</span>
          <EventStatusBadge status={event.status} matchCount={event.matches.length} />
        </div>
        <div className="text-xs text-zinc-500">{formatDate(event.event_date)}</div>
        {event.matches.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {event.matches.map((m) => (
              <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full border ${
                m.status === 'live' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                m.status === 'completed' ? 'text-zinc-400 border-zinc-700' :
                'text-zinc-500 border-zinc-800'
              }`}>
                Game {m.game_number}
              </span>
            ))}
          </div>
        )}
      </Link>
      {!confirming ? (
        <button onClick={() => setConfirming(true)}
          style={{ background: '#ef4444', borderRadius: '12px', padding: '0 14px', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>
          ✕
        </button>
      ) : (
        <button onClick={() => onDelete(event.id)}
          style={{ background: '#dc2626', borderRadius: '12px', padding: '0 10px', color: 'white', fontSize: '12px', fontWeight: '600' }}>
          Del?
        </button>
      )}
    </div>
  )
}

function EventStatusBadge({ status, matchCount }: { status: string; matchCount: number }) {
  if (status === 'live') return <span className="text-xs text-emerald-400 font-semibold">● Live</span>
  if (status === 'completed') return <span className="text-xs text-zinc-500">Completed</span>
  if (matchCount === 0) return <span className="text-xs text-zinc-600">No games yet</span>
  return <span className="text-xs text-zinc-500">{matchCount} game{matchCount !== 1 ? 's' : ''}</span>
}
