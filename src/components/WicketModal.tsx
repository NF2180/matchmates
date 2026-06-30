import { useState } from 'react'
import type { WicketType } from '../lib/scoringEngine'
import type { Player } from '../types'

interface Props {
  striker: Player
  nonStriker: Player
  fieldingPlayers: Player[]
  allowedTypes?: WicketType[]
  runsLabel?: string
  wicketKeeperId?: string | null
  onConfirm: (result: WicketResult) => void
  onCancel: () => void
}

export interface WicketResult {
  wicketType: WicketType
  dismissedPlayerId: string  // striker or non-striker (run out can be either)
  fielderId: string | null
  batterRuns: number         // runs scored on this delivery before wicket
}

const WICKET_TYPES: Array<{ type: WicketType; label: string; needsFielder: boolean; canDismissNonStriker: boolean }> = [
  { type: 'bowled',       label: 'Bowled',        needsFielder: false, canDismissNonStriker: false },
  { type: 'caught',       label: 'Caught',        needsFielder: true,  canDismissNonStriker: false },
  { type: 'lbw',          label: 'LBW',           needsFielder: false, canDismissNonStriker: false },
  { type: 'run_out',      label: 'Run Out',       needsFielder: true,  canDismissNonStriker: true  },
  { type: 'stumped',      label: 'Stumped',       needsFielder: true,  canDismissNonStriker: false },
  { type: 'hit_wicket',   label: 'Hit Wicket',    needsFielder: false, canDismissNonStriker: false },
  { type: 'retired_hurt', label: 'Retired Hurt',  needsFielder: false, canDismissNonStriker: false },
]

export default function WicketModal({ striker, nonStriker, fieldingPlayers, allowedTypes, runsLabel, wicketKeeperId, onConfirm, onCancel }: Props) {
  const [wicketType, setWicketType] = useState<WicketType | null>(null)
  const [dismissedId, setDismissedId] = useState<string>(striker.id)
  const [fielderId, setFielderId] = useState<string>('')

  function handleWicketTypeChange(type: WicketType) {
    setWicketType(type)
    // Auto-select wicketkeeper for stumping and caught-behind scenarios
    if (type === 'stumped' && wicketKeeperId) {
      setFielderId(wicketKeeperId)
    }
  }
  const [batterRuns, setBatterRuns] = useState(0)

  const visibleTypes = allowedTypes
    ? WICKET_TYPES.filter((w) => allowedTypes.includes(w.type))
    : WICKET_TYPES

  const selected = visibleTypes.find((w) => w.type === wicketType)

  function handleConfirm() {
    if (!wicketType) return
    onConfirm({
      wicketType,
      dismissedPlayerId: dismissedId,
      fielderId: selected?.needsFielder && fielderId ? fielderId : null,
      batterRuns,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={onCancel}>
      <div
        className="bg-zinc-900 border-t border-zinc-700 w-full rounded-t-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Wicket</h2>
          <button onClick={onCancel} className="text-zinc-500 text-sm">Cancel</button>
        </div>

        {/* Batter runs scored on this delivery */}
        <div className="mb-4">
          <p className="text-xs text-zinc-400 mb-2">{runsLabel ?? 'Runs scored on this delivery (before wicket)'}</p>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button
                key={r}
                onClick={() => setBatterRuns(r)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${
                  batterRuns === r
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Dismissal type */}
        <p className="text-xs text-zinc-400 mb-2">How out?</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {visibleTypes.map((w) => (
            <button
              key={w.type}
              onClick={() => {
                handleWicketTypeChange(w.type)
                setDismissedId(striker.id) // reset to striker on type change
              }}
              className={`py-2.5 rounded-lg text-sm font-medium border ${
                wicketType === w.type
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* Run out: which batter? */}
        {wicketType && selected?.canDismissNonStriker && (
          <div className="mb-4">
            <p className="text-xs text-zinc-400 mb-2">Who was run out?</p>
            <div className="flex gap-2">
              {[striker, nonStriker].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setDismissedId(p.id)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${
                    dismissedId === p.id
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fielder (caught/stumped/run out) */}
        {wicketType && selected?.needsFielder && (
          <div className="mb-4">
            <p className="text-xs text-zinc-400 mb-2">
              {wicketType === 'caught' ? 'Caught by' : wicketType === 'stumped' ? 'Stumped by' : 'Run out by'}
            </p>
            <select
              value={fielderId}
              onChange={(e) => setFielderId(e.target.value)}
              className="input text-sm"
            >
              <option value="">Select fielder</option>
              {fieldingPlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!wicketType}
          className="w-full bg-red-500 active:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-xl py-3.5 text-base mt-2"
        >
          Confirm Wicket
        </button>
      </div>
    </div>
  )
}
