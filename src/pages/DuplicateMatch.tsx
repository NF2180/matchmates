import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateMatchCode, generateJoinToken } from '../lib/matchUtils'
import { getStoredPlayerId } from '../lib/identity'
import type { Match } from '../types'

const FORMATS = ['T20', 'T10', 'ODI', 'Custom']

export default function DuplicateMatch() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [sourceMatch, setSourceMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)

  // Editable fields (ground is locked, copied from source)
  const [matchName, setMatchName] = useState('')
  const [format, setFormat] = useState('T20')
  const [overs, setOvers] = useState('20')
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      const { data, error } = await supabase
        .from('matches')
        .select('*, ground:grounds(*)')
        .eq('id', id)
        .single()
      if (error || !data) {
        setLoading(false)
        return
      }
      const m = data as Match
      setSourceMatch(m)
      // Pre-fill from source
      setMatchName(`${m.match_name} (2)`)
      setFormat(m.format ?? 'T20')
      setOvers(String(m.overs ?? 20))
      setMatchDate(m.match_date)
      setMatchTime(m.match_time ?? '')
      setLoading(false)
    }
    load()
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!matchName.trim() || !sourceMatch) return
    setError(null)
    setSubmitting(true)

    try {
      const organizerId = getStoredPlayerId()

      const { data: newMatch, error: matchError } = await supabase
        .from('matches')
        .insert({
          match_code: generateMatchCode(),
          join_token: generateJoinToken(),
          match_name: matchName.trim(),
          sport: sourceMatch.sport,
          format,
          overs: overs ? parseInt(overs, 10) : null,
          ground_id: sourceMatch.ground_id, // locked from source
          organizer_id: organizerId,
          match_date: matchDate,
          match_time: matchTime || null,
          status: 'created',
        })
        .select()
        .single()

      if (matchError) throw matchError

      // Navigate to new match — organiser will add attendance and teams fresh
      navigate(`/match/${newMatch.id}/attendance`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate match')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  }

  if (!sourceMatch) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 text-sm mb-3">Match not found</p>
        <Link to="/" className="text-emerald-400 text-sm">← Back home</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to={`/match/${sourceMatch.id}`} className="text-sm text-zinc-500 mb-2 inline-block">← Back to match</Link>
        <h1 className="text-xl font-bold text-white">Duplicate Match</h1>
        <p className="text-sm text-zinc-400 mt-1">Creates a new match based on this one.</p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Match Name">
          <input
            type="text"
            value={matchName}
            onChange={(e) => setMatchName(e.target.value)}
            className="input"
            autoFocus
          />
        </Field>

        <Field label="Format">
          <div className="flex gap-2 flex-wrap">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  format === f
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Overs">
          <input
            type="number"
            value={overs}
            onChange={(e) => setOvers(e.target.value)}
            className="input"
            min={1}
          />
        </Field>

        <Field label="Ground (locked from original)">
          <div className="input bg-zinc-800/50 text-zinc-500 cursor-not-allowed">
            {sourceMatch.ground?.name ?? 'No ground set'}
          </div>
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Time">
          <input
            type="time"
            value={matchTime}
            onChange={(e) => setMatchTime(e.target.value)}
            className="input"
          />
        </Field>

        {error && (
          <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !matchName.trim()}
          className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-base mt-2"
        >
          {submitting ? 'Creating…' : 'Create Duplicate Match'}
        </button>

        <p className="text-xs text-zinc-600 text-center">
          Attendance and teams start fresh — add players from the day's pool on the next screen.
        </p>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  )
}
