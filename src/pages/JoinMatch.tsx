import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getStoredPlayerId, setStoredPlayerId } from '../lib/identity'
import { formatDate, formatTime } from '../lib/matchUtils'
import type { Event, Player, ParticipationStatus } from '../types'

type Step = 'loading' | 'identify' | 'confirm' | 'done' | 'error'

export default function JoinMatch() {
  const { token } = useParams<{ token: string }>()
  const [step, setStep] = useState<Step>('loading')
  const [event, setEvent] = useState<Event | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [finalStatus, setFinalStatus] = useState<ParticipationStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init(joinToken: string) {
      const { data: evData } = await supabase.from('events').select('*, ground:grounds(*)').eq('join_token', joinToken).single()
      if (!evData) { setError('This link is invalid or has expired.'); setStep('error'); return }
      setEvent(evData as Event)
      const storedId = getStoredPlayerId()
      if (storedId) {
        const { data: p } = await supabase.from('players').select('*').eq('id', storedId).maybeSingle()
        if (p) { setPlayer(p as Player); setStep('confirm'); return }
      }
      setStep('identify')
    }
    if (token) init(token)
  }, [token])

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true); setError(null)
    try {
      let resolved: Player | null = null
      if (mobile.trim()) {
        const { data } = await supabase.from('players').select('*').eq('mobile_number', mobile.trim()).maybeSingle()
        if (data) resolved = data as Player
      }
      if (!resolved) {
        const { data, error: err } = await supabase.from('players').insert({ name: name.trim(), mobile_number: mobile.trim() || null }).select().single()
        if (err) throw err
        resolved = data as Player
      }
      setStoredPlayerId(resolved.id)
      setPlayer(resolved)
      setStep('confirm')
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSubmitting(false) }
  }

  async function handleConfirm(status: ParticipationStatus) {
    if (!event || !player) return
    setSubmitting(true); setError(null)
    try {
      await supabase.from('participation').upsert(
        { event_id: event.id, player_id: player.id, status, responded_at: new Date().toISOString() },
        { onConflict: 'event_id,player_id' }
      )
      setFinalStatus(status); setStep('done')
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSubmitting(false) }
  }

  if (step === 'loading') return <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>
  if (step === 'error') return (
    <div className="px-4 py-12 text-center">
      <p className="text-red-400 text-sm mb-3">{error}</p>
      <Link to="/" className="text-emerald-400 text-sm">← Home</Link>
    </div>
  )

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-8 pb-6 text-center">
        <div className="text-3xl mb-2">🏏</div>
        <h1 className="text-xl font-bold text-white">{event?.event_name}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {event && formatDate(event.event_date)}
          {event?.event_time && ` · ${formatTime(event.event_time)}`}
        </p>
        {(event as any)?.ground?.name && <p className="text-xs text-zinc-500 mt-0.5">📍 {(event as any).ground.name}</p>}
      </header>

      {step === 'identify' && (
        <form onSubmit={handleIdentify} className="flex flex-col gap-4">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="input" autoFocus />
          <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile (optional)" className="input" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5">
            {submitting ? 'Saving…' : 'Continue →'}
          </button>
        </form>
      )}

      {step === 'confirm' && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-zinc-300">Hi <strong>{player?.name}</strong>, are you playing?</p>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button onClick={() => handleConfirm('playing')} disabled={submitting}
            className="w-full bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5">
            ✅ Yes, I'm playing
          </button>
          <button onClick={() => handleConfirm('not_playing')} disabled={submitting}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium rounded-xl py-3.5">
            ❌ Can't make it
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">{finalStatus === 'playing' ? '✅' : '❌'}</div>
          <p className="text-white font-semibold text-lg">
            {finalStatus === 'playing' ? 'You\'re confirmed!' : 'Got it, see you next time!'}
          </p>
          <Link to="/" className="text-emerald-400 text-sm mt-6 block">← Home</Link>
        </div>
      )}
    </div>
  )
}
