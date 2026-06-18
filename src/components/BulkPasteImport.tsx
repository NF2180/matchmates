import { useState } from 'react'
import {
  parsePastedNames,
  findExistingByName,
  hasParticipation,
  createPlayer,
  addPendingParticipation,
} from '../lib/bulkImport'
import { getTargetMatch } from '../lib/targetMatch'
import { supabase } from '../lib/supabase'
import type { Match } from '../types'

type RowStatus =
  | 'pending_review' // needs admin decision (name matched an existing player)
  | 'ready' // no conflict, will create new or already resolved
  | 'already_in_match' // resolved player already has participation in this match
  | 'done' // successfully imported
  | 'error'

interface ReviewRow {
  cleaned: string
  status: RowStatus
  existingCandidateId?: string
  existingCandidateName?: string
  mobileInput: string
  errorMessage?: string
}

export default function BulkPasteImport({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<'paste' | 'review' | 'importing' | 'done'>('paste')
  const [text, setText] = useState('')
  const [targetMatch, setTargetMatch] = useState<Match | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loadingReview, setLoadingReview] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ created: number; matched: number; alreadyIn: number } | null>(null)

  async function handleParse() {
    setLoadError(null)
    const names = parsePastedNames(text)
    if (names.length === 0) {
      setLoadError('No names found. Paste one name per line.')
      return
    }

    setLoadingReview(true)
    try {
      const match = await getTargetMatch()
      if (!match) {
        setLoadError('No matches exist yet. Create a match first.')
        setLoadingReview(false)
        return
      }
      setTargetMatch(match)

      const built: ReviewRow[] = []
      for (const { cleaned } of names) {
        const existing = await findExistingByName(cleaned)
        if (existing) {
          const already = await hasParticipation(match.id, existing.id)
          if (already) {
            built.push({ cleaned, status: 'already_in_match', mobileInput: '' })
          } else {
            built.push({
              cleaned,
              status: 'pending_review',
              existingCandidateId: existing.id,
              existingCandidateName: existing.name,
              mobileInput: '',
            })
          }
        } else {
          built.push({ cleaned, status: 'ready', mobileInput: '' })
        }
      }

      setRows(built)
      setStep('review')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to prepare import')
    } finally {
      setLoadingReview(false)
    }
  }

  function updateRowMobile(index: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, mobileInput: value } : r)))
  }

  function resolveRowAsNew(index: number) {
    // admin chooses "create new anyway" instead of confirming identity
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: 'ready' } : r)))
  }

  async function confirmRowMobile(index: number) {
    const row = rows[index]
    if (!row.existingCandidateId) return

    // fetch the existing candidate's actual stored mobile to compare
    const { data: candidate } = await supabase
      .from('players')
      .select('mobile_number')
      .eq('id', row.existingCandidateId)
      .maybeSingle()

    const trimmedInput = row.mobileInput.trim()
    const candidateMobile = candidate?.mobile_number ?? null

    // Whether confirmed or not, mark ready - the actual decision (reuse vs
    // create new) is re-verified at import time using row.mobileInput
    if (candidateMobile && trimmedInput === candidateMobile) {
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: 'ready' } : r)))
    } else {
      setRows((prev) =>
        prev.map((r, i) =>
          i === index
            ? { ...r, status: 'ready', mobileInput: '', existingCandidateId: undefined }
            : r
        )
      )
    }
  }

  async function runImport() {
    if (!targetMatch) return
    setStep('importing')

    let created = 0
    let matched = 0
    let alreadyIn = 0

    const updated = [...rows]

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i]
      if (row.status === 'already_in_match') {
        alreadyIn++
        updated[i] = { ...row, status: 'done' }
        continue
      }

      try {
        let playerId: string

        if (row.existingCandidateId) {
          playerId = row.existingCandidateId
          matched++
        } else {
          const newPlayer = await createPlayer(row.cleaned)
          playerId = newPlayer.id
          created++
        }

        await addPendingParticipation(targetMatch.id, playerId)
        updated[i] = { ...row, status: 'done' }
      } catch (err) {
        updated[i] = {
          ...row,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Failed',
        }
      }
    }

    setRows(updated)
    setSummary({ created, matched, alreadyIn })
    setStep('done')
  }

  if (step === 'paste') {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Paste names, one per line\ne.g.\nRaj\nNitin\nVipul'}
          className="input min-h-[140px] resize-none"
        />
        {loadError && <div className="text-red-400 text-sm">{loadError}</div>}
        <button
          onClick={handleParse}
          disabled={loadingReview || !text.trim()}
          className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3 text-sm"
        >
          {loadingReview ? 'Checking names…' : 'Review Names'}
        </button>
      </div>
    )
  }

  if (step === 'review') {
    const needsReview = rows.some((r) => r.status === 'pending_review')

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-400">
          Importing into: <span className="text-white font-medium">{targetMatch?.match_name}</span>
        </p>

        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
          {rows.map((row, i) => (
            <div key={`${row.cleaned}-${i}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="text-sm text-white mb-1">{row.cleaned}</div>

              {row.status === 'already_in_match' && (
                <div className="text-xs text-zinc-500">Already in this match — will be skipped</div>
              )}

              {row.status === 'ready' && (
                <div className="text-xs text-emerald-400">Ready to import</div>
              )}

              {row.status === 'pending_review' && (
                <div className="flex flex-col gap-2 mt-1">
                  <div className="text-xs text-amber-400">
                    A player named "{row.existingCandidateName}" already exists. Enter their mobile
                    number to confirm it's the same person, or skip to create a new entry.
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={row.mobileInput}
                      onChange={(e) => updateRowMobile(i, e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mobile number"
                      className="input py-1.5 text-sm flex-1"
                    />
                    <button
                      onClick={() => confirmRowMobile(i)}
                      className="px-3 bg-zinc-800 text-zinc-200 rounded-lg text-xs"
                    >
                      Confirm
                    </button>
                  </div>
                  <button
                    onClick={() => resolveRowAsNew(i)}
                    className="text-xs text-zinc-500 text-left"
                  >
                    Skip — create as new player instead
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={runImport}
          disabled={needsReview}
          className="w-full bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl py-3 text-sm"
        >
          {needsReview ? 'Resolve flagged names above first' : `Import ${rows.length} Names`}
        </button>
        <button
          onClick={() => {
            setStep('paste')
            setRows([])
          }}
          className="text-xs text-zinc-500"
        >
          ← Start over
        </button>
      </div>
    )
  }

  if (step === 'importing') {
    return <div className="text-zinc-500 text-sm py-8 text-center">Importing…</div>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-white">
        Imported into <span className="font-medium">{targetMatch?.match_name}</span> as pending:
      </div>
      <div className="text-sm text-zinc-400">
        {summary?.created ?? 0} new player{summary?.created !== 1 ? 's' : ''} created
        {summary && summary.matched > 0 && `, ${summary.matched} matched to existing players`}
        {summary && summary.alreadyIn > 0 && `, ${summary.alreadyIn} already in match (skipped)`}
      </div>
      <button
        onClick={() => {
          setStep('paste')
          setText('')
          setRows([])
          setSummary(null)
          onComplete()
        }}
        className="w-full bg-zinc-800 text-zinc-200 font-medium rounded-xl py-3 text-sm"
      >
        Done
      </button>
    </div>
  )
}
