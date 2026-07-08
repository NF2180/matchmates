import { useState } from 'react'
import type { Delivery } from '../lib/scoringEngine'

interface Props {
  delivery: Delivery
  overNumber: number
  ballIndex: number
  onSave: (updated: Partial<Delivery>) => void
  onClose: () => void
}

const EXTRA_TYPES = [
  { value: null, label: 'None' },
  { value: 'wide', label: 'Wide' },
  { value: 'no_ball', label: 'No Ball' },
  { value: 'bye', label: 'Bye' },
  { value: 'leg_bye', label: 'Leg Bye' },
]

const WICKET_TYPES = [
  'bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired_hurt'
]

export default function EditDeliveryModal({ delivery, overNumber, ballIndex, onSave, onClose }: Props) {
  const [batterRuns, setBatterRuns] = useState(delivery.batter_runs)
  const [extraRuns, setExtraRuns] = useState(delivery.extra_runs)
  const [extraType, setExtraType] = useState<string | null>(delivery.extra_type)
  const [isWicket, setIsWicket] = useState(delivery.is_wicket)
  const [wicketType, setWicketType] = useState<string | null>(delivery.wicket_type)
  const [isFreehit, setIsFreehit] = useState(delivery.is_free_hit)

  const isLegal = extraType !== 'wide' && extraType !== 'no_ball'
  const totalRuns = batterRuns + extraRuns

  function handleSave() {
    onSave({
      batter_runs: batterRuns,
      extra_runs: extraRuns,
      extra_type: extraType as any,
      total_runs: totalRuns,
      is_legal: isLegal,
      is_wicket: isWicket,
      wicket_type: isWicket ? wicketType as any : null,
      is_free_hit: isFreehit,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl w-full max-w-lg mx-auto p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Edit Ball — Over {overNumber + 1}, Ball {ballIndex + 1}</h3>
          <button onClick={onClose} className="text-zinc-500">✕</button>
        </div>

        {/* Batter runs */}
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-2">Batter Runs</p>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button key={r} onClick={() => setBatterRuns(r)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border ${batterRuns === r ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Extra type */}
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-2">Extra Type</p>
          <div className="flex gap-1.5 flex-wrap">
            {EXTRA_TYPES.map((e) => (
              <button key={String(e.value)} onClick={() => setExtraType(e.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border ${extraType === e.value ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Extra runs (if extra) */}
        {extraType && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">Extra Runs</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((r) => (
                <button key={r} onClick={() => setExtraRuns(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${extraRuns === r ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Wicket */}
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setIsWicket(!isWicket)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border ${isWicket ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
            {isWicket ? 'Wicket ✓' : 'Wicket'}
          </button>
          <button onClick={() => setIsFreehit(!isFreehit)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${isFreehit ? 'bg-amber-500 text-zinc-950 border-amber-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
            Free Hit
          </button>
        </div>

        {isWicket && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">Wicket Type</p>
            <div className="flex gap-1.5 flex-wrap">
              {WICKET_TYPES.map((w) => (
                <button key={w} onClick={() => setWicketType(w)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize ${wicketType === w ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                  {w.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="bg-zinc-800 rounded-lg px-4 py-2 mb-4 text-sm text-zinc-300">
          Total: {totalRuns} run{totalRuns !== 1 ? 's' : ''}
          {extraType && ` (${extraType})`}
          {isWicket && ' + W'}
          {!isLegal && ' [not legal]'}
        </div>

        <button onClick={handleSave}
          className="w-full bg-emerald-500 text-zinc-950 font-semibold rounded-xl py-3">
          Save Changes
        </button>
      </div>
    </div>
  )
}
