import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildJoinUrl, buildWhatsAppShareMessage } from '../lib/matchUtils'
import type { Match, Participation } from '../types'

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const [match, setMatch] = useState<Match | null>(null)
  const [participants, setParticipants] = useState<Participation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function loadMatch(matchId: string) {
      setLoading(true)
      setError(null)

      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('*, ground:grounds(*)')
        .eq('id', matchId)
        .single()

      if (matchError) {
        setError(matchError.message)
        setLoading(false)
        return
      }

      setMatch(matchData as Match)

      const { data: participationData } = await supabase
        .from('participation')
        .select('*, player:players(*)')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true })

      setParticipants((participationData as Participation[]) ?? [])
      setLoading(false)
    }
    if (id) loadMatch(id)
  }, [id])

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  }

  if (error || !match) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error ?? 'Match not found'}</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  const joinUrl = buildJoinUrl(match.join_token)
  const whatsappMessage = buildWhatsAppShareMessage(
    match.match_name,
    formatDate(match.match_date),
    match.match_time ? formatTime(match.match_time) : null,
    joinUrl
  )

  const playing = participants.filter((p) => p.status === 'playing')
  const notPlaying = participants.filter((p) => p.status === 'not_playing')
  const pending = participants.filter((p) => p.status === 'pending')

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to="/" className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">{match.match_name}</h1>
        <div className="text-sm text-zinc-400 mt-1">
          {formatDate(match.match_date)}
          {match.match_time && ` · ${formatTime(match.match_time)}`}
          {match.format && ` · ${match.format}`}
          {match.overs && ` (${match.overs} overs)`}
        </div>
        {match.ground?.name && (
          <div className="text-sm text-zinc-500 mt-0.5">📍 {match.ground.name}</div>
        )}
        <div className="text-xs text-zinc-600 mt-1 font-mono">{match.match_code}</div>
      </header>

      <div className="flex gap-2 mb-6">
        <a
          href={`https://wa.me/?text=${whatsappMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-[#25D366] text-zinc-950 font-semibold rounded-xl py-3 text-center text-sm flex items-center justify-center gap-2"
        >
          Share on WhatsApp
        </a>
        <button
          onClick={copyLink}
          className="px-4 bg-zinc-800 text-zinc-200 font-medium rounded-xl text-sm border border-zinc-700"
        >
          {copied ? '✓ Copied' : 'Copy Link'}
        </button>
      </div>

      <Link
        to={`/match/${match.id}/attendance`}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3 flex items-center justify-between active:bg-zinc-800"
      >
        <div>
          <div className="font-semibold text-white text-sm">Manage Attendance</div>
          <div className="text-xs text-zinc-500 mt-0.5">Add guests, edit, merge duplicates</div>
        </div>
        <span className="text-zinc-500">→</span>
      </Link>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <StatBox label="Playing" count={playing.length} color="emerald" />
        <StatBox label="Not Playing" count={notPlaying.length} color="zinc" />
        <StatBox label="Pending" count={pending.length} color="amber" />
      </div>

      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Playing ({playing.length})
      </h2>
      <div className="flex flex-col gap-2 mb-6">
        {playing.length === 0 && (
          <div className="text-zinc-600 text-sm py-3 text-center border border-dashed border-zinc-800 rounded-lg">
            No confirmations yet
          </div>
        )}
        {playing.map((p) => (
          <PlayerRow key={p.id} participation={p} />
        ))}
      </div>

      {pending.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Pending ({pending.length})
          </h2>
          <div className="flex flex-col gap-2 mb-6">
            {pending.map((p) => (
              <PlayerRow key={p.id} participation={p} />
            ))}
          </div>
        </>
      )}

      {notPlaying.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Not Playing ({notPlaying.length})
          </h2>
          <div className="flex flex-col gap-2">
            {notPlaying.map((p) => (
              <PlayerRow key={p.id} participation={p} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatBox({ label, count, color }: { label: string; count: number; color: 'emerald' | 'zinc' | 'amber' }) {
  const colors = {
    emerald: 'text-emerald-400',
    zinc: 'text-zinc-400',
    amber: 'text-amber-400',
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-3 text-center">
      <div className={`text-2xl font-bold ${colors[color]}`}>{count}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  )
}

function PlayerRow({ participation }: { participation: Participation }) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
        {participation.player?.name?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{participation.player?.name ?? 'Unknown'}</div>
      </div>
      {participation.is_guest && (
        <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Guest</span>
      )}
    </div>
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
