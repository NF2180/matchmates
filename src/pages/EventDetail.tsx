import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildJoinUrl, buildWhatsAppMessage, formatDate, formatTime } from '../lib/matchUtils'
import { useAdminAccess } from '../hooks/useAdminAccess'
import type { Event, Match, Participation } from '../types'

export default function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const adminState = useAdminAccess(id)
  const isAdmin = adminState === 'admin'

  const [event, setEvent] = useState<Event | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [participants, setParticipants] = useState<Participation[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [creatingGame, setCreatingGame] = useState(false)

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: ev } = await supabase.from('events').select('*, ground:grounds(*)').eq('id', id).single()
      if (!ev) { setLoading(false); return }
      setEvent(ev as Event)

      const { data: ms } = await supabase.from('matches').select('*').eq('event_id', id).order('game_number')
      setMatches((ms as Match[]) ?? [])

      const { data: parts } = await supabase.from('participation').select('*, player:players(*)').eq('event_id', id)
      setParticipants((parts as Participation[]) ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  async function createNewGame() {
    if (!event || !id) return
    setCreatingGame(true)
    const gameNumber = matches.length + 1

    const { data: match } = await supabase.from('matches').insert({
      event_id: id,
      game_number: gameNumber,
      match_name: `Game ${gameNumber}`,
      sport: 'cricket',
      format: 'T20',
      overs: 20,
      status: 'created',
    }).select().single()

    if (!match) { setCreatingGame(false); return }

    // Copy teams from previous game if exists
    const prevMatch = matches[matches.length - 1]
    if (prevMatch) {
      const { data: prevTeams } = await supabase.from('teams').select('id, name').eq('match_id', prevMatch.id)
      const { data: prevMembers } = await supabase.from('team_members').select('participation_id, team_id, role').eq('match_id', prevMatch.id)

      if (prevTeams && prevTeams.length >= 2) {
        for (const prevTeam of prevTeams) {
          const { data: newTeam } = await supabase.from('teams').insert({ match_id: match.id, name: prevTeam.name }).select().single()
          if (!newTeam) continue
          const teamMembers = (prevMembers ?? []).filter((m: any) => m.team_id === prevTeam.id)
          for (const m of teamMembers) {
            await supabase.from('team_members').insert({
              match_id: match.id,
              participation_id: m.participation_id,
              team_id: newTeam.id,
              role: m.role,
            })
          }
        }
      }
    }

    navigate(`/match/${match.id}/teams`)
    setCreatingGame(false)
  }

  function copyJoinLink() {
    if (!event) return
    navigator.clipboard.writeText(buildJoinUrl(event.join_token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (!event) return <div className="px-4 py-12 text-center"><p className="text-red-400 text-sm">Event not found</p><Link to="/" className="text-emerald-400 text-sm">← Back</Link></div>

  const joinUrl = buildJoinUrl(event.join_token)
  const playing = participants.filter((p) => p.status === 'playing')
  const pending = participants.filter((p) => p.status === 'pending')

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to="/" className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">{event.event_name}</h1>
        <div className="text-sm text-zinc-400 mt-1">
          {formatDate(event.event_date)}
          {event.event_time && ` · ${formatTime(event.event_time)}`}
        </div>
        {(event as any).ground?.name && <div className="text-xs text-zinc-500 mt-0.5">📍 {(event as any).ground.name}</div>}
      </header>

      {/* Share */}
      <div className="flex gap-2 mb-6">
        <a
          href={`https://wa.me/?text=${buildWhatsAppMessage(event.event_name, formatDate(event.event_date), event.event_time, joinUrl)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex-1 bg-green-600 text-white font-medium rounded-xl py-3 text-center text-sm"
        >
          📤 Invite via WhatsApp
        </a>
        <button onClick={copyJoinLink} className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium rounded-xl py-3 text-sm">
          {copied ? '✓ Copied' : '🔗 Copy Link'}
        </button>
      </div>

      {/* Attendance summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Players ({playing.length} confirmed{pending.length > 0 ? `, ${pending.length} pending` : ''})</h2>
          {isAdmin && <Link to={`/event/${id}/attendance`} className="text-xs text-emerald-400">Manage →</Link>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {playing.map((p) => (
            <span key={p.id} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-full">{p.player?.name}</span>
          ))}
        </div>
      </div>

      {/* Games */}
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Games</h2>

      {matches.length === 0 && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl py-6 text-center text-zinc-500 text-sm mb-3">
          No games yet — create the first one
        </div>
      )}

      <div className="flex flex-col gap-2 mb-4">
        {matches.map((m) => (
          <Link key={m.id} to={`/match/${m.id}`} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between active:bg-zinc-800">
            <div>
              <div className="font-semibold text-white text-sm">{m.match_name}</div>
              {m.result_summary && <div className="text-xs text-emerald-400 mt-0.5">🏆 {m.result_summary}</div>}
              {!m.result_summary && m.status === 'live' && <div className="text-xs text-emerald-400 mt-0.5">● Live</div>}
            </div>
            <span className="text-zinc-500">→</span>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <button onClick={createNewGame} disabled={creatingGame || playing.length < 2}
          className="w-full bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-center text-base">
          {creatingGame ? 'Creating…' : '+ New Game'}
        </button>
      )}
      {isAdmin && playing.length < 2 && (
        <p className="text-xs text-zinc-500 text-center mt-2">Add at least 2 players to create a game</p>
      )}
    </div>
  )
}
