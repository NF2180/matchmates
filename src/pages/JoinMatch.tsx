import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getStoredPlayerId, setStoredPlayerId } from '../lib/identity'
import type { Match, Player, ParticipationStatus } from '../types'

type Step = 'loading' | 'identify' | 'confirm' | 'done' | 'error'

export default function JoinMatch() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('loading')
  const [match, setMatch] = useState<Match | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [finalStatus, setFinalStatus] = useState<ParticipationStatus | null>(null)

  useEffect(() => {
    async function init(joinToken: string) {
      setStep('loading')

      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('*, ground:grounds(*)')
        .eq('join_token', joinToken)
        .single()

      if (matchError || !matchData) {
        setError('This match link is invalid or has expired.')
        setStep('error')
        return
      }
      setMatch(matchData as Match)

      const storedId = getStoredPlayerId()
      if (storedId) {
        const { data: playerData } = await supabase
          .from('players')
          .select('*')
          .eq('id', storedId)
          .maybeSingle()

        if (playerData) {
          setPlayer(playerData as Player)
          setStep('confirm')
          return
        }
      }

      setStep('identify')
    }
    if (token) init(token)
  }, [token])

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const trimmedMobile = mobile.trim()
    if (trimmedMobile && !/^[0-9]{10}$/.test(trimmedMobile)) {
      setError('Mobile number must be 10 digits, or leave it blank')
      return
    }

    setSubmitting(true)
    try {
      let resolvedPlayer: Player | null = null

      // Only attempt dedup-by-mobile if a mobile number was actually given
      if (trimmedMobile) {
        const { data: existing } = await supabase
          .from('players')
          .select('*')
          .eq('mobile_number', trimmedMobile)
          .maybeSingle()

        if (existing) {
          resolvedPlayer = existing as Player
        }
      }

      if (!resolvedPlayer) {
        const { data: created, error: createError } = await supabase
          .from('players')
          .insert({ name: name.trim(), mobile_number: trimmedMobile || null })
          .select()
          .single()
        if (createError) throw createError
        resolvedPlayer = created as Player
      }

      setStoredPlayerId(resolvedPlayer.id)
      setPlayer(resolvedPlayer)
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm(status: ParticipationStatus) {
    if (!match || !player) return
    setSubmitting(true)
    setError(null)

    try {
      const { error: upsertError } = await supabase
        .from('participation')
        .upsert(
          {
            match_id: match.id,
            player_id: player.id,
            status,
            responded_at: new Date().toISOString(),
          },
          { onConflict: 'match_id,player_id' }
        )

      if (upsertError) throw upsertError

      setFinalStatus(status)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'loading') {
    return <div className="text-zinc-500 text-sm py-16 text-center">Loading match…</div>
  }

  if (step === 'error') {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-8 pb-6 text-center">
        <div className="text-4xl mb-2">🏏</div>
        <h1 className="text-xl font-bold text-white">{match?.match_name}</h1>
        <div className="text-sm text-zinc-400 mt-1">
          {match && formatDate(match.match_date)}
          {match?.match_time && ` · ${formatTime(match.match_time)}`}
        </div>
        {match?.ground?.name && (
          <div className="text-sm text-zinc-500 mt-1">📍 {match.ground.name}</div>
        )}
      </header>

      {step === 'identify' && (
        <form onSubmit={handleIdentify} className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400 text-center mb-2">
            Enter your details to join this match
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="input"
          />
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Mobile number (optional)"
            className="input"
          />
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 mt-2"
          >
            {submitting ? 'Please wait…' : 'Continue'}
          </button>
        </form>
      )}

      {step === 'confirm' && player && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400 text-center mb-2">
            Hi {player.name.split(' ')[0]}, are you playing?
          </p>
          <button
            onClick={() => handleConfirm('playing')}
            disabled={submitting}
            className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5"
          >
            ✓ I'm Playing
          </button>
          <button
            onClick={() => handleConfirm('not_playing')}
            disabled={submitting}
            className="w-full bg-zinc-800 active:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold rounded-xl py-3.5 border border-zinc-700"
          >
            ✕ Can't Make It
          </button>
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">{finalStatus === 'playing' ? '🎉' : '👍'}</div>
          <p className="text-white font-semibold mb-1">
            {finalStatus === 'playing' ? "You're in!" : 'Got it, see you next time'}
          </p>
          <p className="text-sm text-zinc-500">
            {finalStatus === 'playing'
              ? 'The organizer has been notified.'
              : 'Thanks for letting us know.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 text-sm text-emerald-400"
          >
            Go to MatchMates home →
          </button>
        </div>
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
