import { useState } from 'react'
import { mergePlayers } from '../lib/mergePlayers'
import type { Player } from '../types'

interface Props {
  players: Player[]
  onMerged: () => void
}

export default function MergePlayersTool({ players, onMerged }: Props) {
  const [open, setOpen] = useState(false)
  const [canonicalId, setCanonicalId] = useState('')
  const [duplicateId, setDuplicateId] = useState('')
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handleMerge() {
    setError(null)
    if (!canonicalId || !duplicateId) {
      setError('Select both players')
      return
    }
    if (canonicalId === duplicateId) {
      setError('Choose two different players')
      return
    }

    setMerging(true)
    try {
      const res = await mergePlayers(canonicalId, duplicateId)
      setResult(
        `Merged. ${res.movedParticipations} match record${res.movedParticipations !== 1 ? 's' : ''} moved` +
          (res.skippedParticipations > 0
            ? `, ${res.skippedParticipations} duplicate match record${res.skippedParticipations !== 1 ? 's' : ''} dropped`
            : '')
      )
      setCanonicalId('')
      setDuplicateId('')
      onMerged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-zinc-500 underline text-left">
        Merge duplicate players
      </button>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Merge Duplicate Players</h3>
        <button onClick={() => setOpen(false)} className="text-zinc-500 text-xs">
          ✕
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Combines two player records into one. All match history moves to the player you keep;
        the other record is deleted. Use this when the same person ended up with two profiles.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-400">Keep this player</span>
        <select value={canonicalId} onChange={(e) => setCanonicalId(e.target.value)} className="input text-sm">
          <option value="">Select player</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.mobile_number ? `(${p.mobile_number})` : '(no mobile)'}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-400">Merge and delete this one</span>
        <select value={duplicateId} onChange={(e) => setDuplicateId(e.target.value)} className="input text-sm">
          <option value="">Select player</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.mobile_number ? `(${p.mobile_number})` : '(no mobile)'}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="text-red-400 text-xs">{error}</div>}
      {result && <div className="text-emerald-400 text-xs">{result}</div>}

      <button
        onClick={handleMerge}
        disabled={merging}
        className="w-full bg-amber-500 active:bg-amber-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm"
      >
        {merging ? 'Merging…' : 'Merge Players'}
      </button>
    </div>
  )
}
