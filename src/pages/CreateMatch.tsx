import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateCode, generateJoinToken, generateAdminToken } from '../lib/matchUtils'
import { getStoredPlayerId, setStoredAdminToken } from '../lib/identity'
import type { Ground } from '../types'

const FORMATS = ['T20', 'T10', 'ODI', 'Custom']

export default function CreateMatch() {
  const navigate = useNavigate()
  const [grounds, setGrounds] = useState<Ground[]>([])
  const [matchName, setMatchName] = useState('')
  const [format, setFormat] = useState('T20')
  const [overs, setOvers] = useState('20')
  const [groundId, setGroundId] = useState<string>('')
  const [newGroundName, setNewGroundName] = useState('')
  const [showNewGround, setShowNewGround] = useState(false)
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().split('T')[0])
  const [matchTime, setMatchTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadGrounds() {
      const { data } = await supabase.from('grounds').select('*').order('name')
      if (data) setGrounds(data as Ground[])
    }
    loadGrounds()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!matchName.trim()) {
      setError('Match name is required')
      return
    }
    if (showNewGround && !newGroundName.trim()) {
      setError('Enter a ground name or select an existing one')
      return
    }

    setSubmitting(true)

    try {
      let finalGroundId = groundId || null

      if (showNewGround && newGroundName.trim()) {
        const { data: groundData, error: groundError } = await supabase
          .from('grounds')
          .insert({ name: newGroundName.trim() })
          .select()
          .single()
        if (groundError) throw groundError
        finalGroundId = groundData.id
      }

      const organizerId = getStoredPlayerId() || null
      const adminToken = generateAdminToken()

      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .insert({
          match_code: generateCode(),
          join_token: generateJoinToken(),
          admin_token: adminToken,
          match_name: matchName.trim(),
          sport: 'cricket',
          format,
          overs: overs ? parseInt(overs, 10) : null,
          ground_id: finalGroundId,
          organizer_id: organizerId,
          match_date: matchDate,
          match_time: matchTime || null,
          status: 'created',
        })
        .select()
        .single()

      if (matchError) throw matchError

      setStoredAdminToken(matchData.id, adminToken)

      navigate(`/match/${matchData.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      setError(msg || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <h1 className="text-xl font-bold text-white">Create Match</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Match Name">
          <input
            type="text"
            value={matchName}
            onChange={(e) => setMatchName(e.target.value)}
            placeholder="e.g. Sunday Morning Bash"
            className="input"
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
            placeholder="e.g. 20"
            className="input"
            min={1}
          />
        </Field>

        <Field label="Ground">
          {!showNewGround ? (
            <div className="flex flex-col gap-2">
              <select
                value={groundId}
                onChange={(e) => setGroundId(e.target.value)}
                className="input"
              >
                <option value="">Select a ground</option>
                {grounds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewGround(true)}
                className="text-sm text-emerald-400 text-left"
              >
                + Add new ground
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={newGroundName}
                onChange={(e) => setNewGroundName(e.target.value)}
                placeholder="Ground name"
                className="input"
              />
              <button
                type="button"
                onClick={() => {
                  setShowNewGround(false)
                  setNewGroundName('')
                }}
                className="text-sm text-zinc-400 text-left"
              >
                Use existing ground instead
              </button>
            </div>
          )}
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
          disabled={submitting}
          className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3.5 text-center text-base mt-2"
        >
          {submitting ? 'Creating…' : 'Create Match'}
        </button>
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
