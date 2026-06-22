import { useEffect, useRef, useState } from 'react'
import { fuzzyMatchName } from '../lib/fuzzyMatch'
import { supabase } from '../lib/supabase'
import type { Team, Participation } from '../types'

// Web Speech API minimal type declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative
  length: number
}
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance
}
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export interface VoiceAssignment {
  participation: Participation
  teamId: string
  teamName: string
}

export interface VoiceUnmatched {
  spokenName: string
  teamId: string
  teamName: string
}

interface Props {
  matchId: string
  teamA: Team
  teamB: Team
  participants: Participation[]
  onAssignments: (assignments: VoiceAssignment[]) => void
  onClose: () => void
}

type MicState = 'idle' | 'listening' | 'processing'

/**
 * Determines which team side (A or B) a spoken label refers to.
 * Handles common speech-recognition mishearings:
 *   Team A: "a", "ay", "eh", "alpha", "eight", "ate"
 *   Team B: "b", "be", "bee", "bi", "beta", "the"
 */
function detectTeamSide(word: string): 'A' | 'B' | null {
  const w = word.toLowerCase().trim()
  const sideA = ['a', 'ay', 'eh', 'alpha', 'eight', 'ate', 'ae']
  const sideB = ['b', 'be', 'bee', 'bi', 'beta', 'the', 'bea', 'bay']
  if (sideA.includes(w)) return 'A'
  if (sideB.includes(w)) return 'B'
  return null
}

export default function VoiceTeamAssign({ matchId, teamA, teamB, participants, onAssignments, onClose }: Props) {
  const [micState, setMicState] = useState<MicState>('idle')
  const [transcript, setTranscript] = useState('')
  const [preview, setPreview] = useState<VoiceAssignment[]>([])
  const [unmatched, setUnmatched] = useState<VoiceUnmatched[]>([])
  const [step, setStep] = useState<'record' | 'review'>('record')
  const [applying, setApplying] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const isSpeechSupported = !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)

  useEffect(() => {
    return () => { recognitionRef.current?.abort() }
  }, [])

  function startListening() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-IN'

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let full = ''
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript + ' '
      }
      setTranscript(full.trim())
    }

    recognition.onerror = () => { setMicState('idle') }
    recognition.onend = () => { setMicState('idle') }

    setTranscript('')
    setMicState('listening')
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setMicState('processing')
    setTimeout(() => {
      parseAndPreview()
      setMicState('idle')
    }, 400)
  }

  function parseAndPreview() {
    const raw = transcript.trim()
    if (!raw) return

    const candidates = participants.map((p) => ({
      id: p.id,
      name: p.player?.name ?? '',
    }))

    // Normalise
    const normalised = raw
      .toLowerCase()
      .replace(/[,:;.!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const words = normalised.split(/\s+/).filter(Boolean)

    // Walk the word list, looking for "team <label>" markers and player names
    // between them. Much more resilient than regex: we scan word by word and
    // detect team labels using detectTeamSide() which handles mishearings.
    const sections: Array<{ side: 'A' | 'B'; nameWords: string[] }> = []
    let currentSection: { side: 'A' | 'B'; nameWords: string[] } | null = null

    let i = 0
    while (i < words.length) {
      if (words[i] === 'team' && i + 1 < words.length) {
        const side = detectTeamSide(words[i + 1])
        if (side !== null) {
          currentSection = { side, nameWords: [] }
          sections.push(currentSection)
          i += 2 // skip "team" and the label word
          continue
        }
      }
      // If we have an active section, accumulate name words into it
      if (currentSection) {
        currentSection.nameWords.push(words[i])
      }
      i++
    }

    const assignments: VoiceAssignment[] = []
    const unmatchedNames: VoiceUnmatched[] = []
    const usedParticipationIds = new Set<string>()

    for (const section of sections) {
      const teamId = section.side === 'A' ? teamA.id : teamB.id
      const teamName = section.side === 'A' ? teamA.name : teamB.name
      const nameWords = section.nameWords

      let j = 0
      while (j < nameWords.length) {
        let matched = false

        // Try longest match first (up to 3 words for multi-word names)
        for (let len = Math.min(3, nameWords.length - j); len >= 1; len--) {
          const nameTry = nameWords.slice(j, j + len).join(' ')
          const result = fuzzyMatchName(nameTry, candidates)

          if (result && !usedParticipationIds.has(result.candidate.id)) {
            const participation = participants.find((p) => p.id === result.candidate.id)
            if (participation) {
              assignments.push({ participation, teamId, teamName })
              usedParticipationIds.add(result.candidate.id)
              j += len
              matched = true
              break
            }
          }
        }

        if (!matched) {
          // Flag as unmatched if it looks like a real name attempt (4+ chars)
          if (nameWords[j].length >= 4) {
            // Capitalize first letter for display
            const displayName = nameWords[j].charAt(0).toUpperCase() + nameWords[j].slice(1)
            unmatchedNames.push({ spokenName: displayName, teamId, teamName })
          }
          j++
        }
      }
    }

    setPreview(assignments)
    setUnmatched(unmatchedNames)

    if (sections.length === 0) {
      // Couldn't detect any "team X" marker at all — go to review so user sees the transcript
      setStep('review')
    } else if (assignments.length > 0 || unmatchedNames.length > 0) {
      setStep('review')
    }
  }

  async function handleConfirm() {
    setApplying(true)
    try {
      const newAssignments: VoiceAssignment[] = []
      for (const u of unmatched) {
        if (!u.teamId) continue

        // Create a new player with no mobile number
        const { data: newPlayer, error: playerError } = await supabase
          .from('players')
          .insert({ name: u.spokenName, mobile_number: null })
          .select()
          .single()
        if (playerError) continue

        // Insert participation and get the real participation row ID back
        const { data: newParticipation, error: partError } = await supabase
          .from('participation')
          .insert({
            match_id: matchId,
            player_id: newPlayer.id,
            status: 'playing',
            is_guest: false,
            added_by_organizer: true,
            responded_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (partError) continue

        newAssignments.push({
          participation: {
            id: newParticipation.id, // ← real participation row ID, safe to pass to assignToTeam
            match_id: matchId,
            player_id: newPlayer.id,
            status: 'playing',
            is_guest: false,
            added_by_organizer: true,
            responded_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            player: newPlayer,
          },
          teamId: u.teamId,
          teamName: u.teamName,
        })
      }

      onAssignments([...preview, ...newAssignments])
      onClose()
    } finally {
      setApplying(false)
    }
  }

  function updateUnmatchedTeam(index: number, teamId: string) {
    const t = teamId === teamA.id ? teamA : teamB
    setUnmatched((prev) =>
      prev.map((u, i) => (i === index ? { ...u, teamId, teamName: t.name } : u))
    )
  }

  function removeUnmatched(index: number) {
    setUnmatched((prev) => prev.filter((_, i) => i !== index))
  }

  if (!isSpeechSupported) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Voice Assignment</h3>
          <button onClick={onClose} className="text-zinc-500 text-xs">✕</button>
        </div>
        <p className="text-sm text-amber-400">
          Voice input is not supported on this browser. Use Chrome on Android for best results.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">🎙 Voice Team Assignment</h3>
        <button onClick={onClose} className="text-zinc-500 text-xs">✕</button>
      </div>

      {step === 'record' && (
        <>
          <p className="text-xs text-zinc-500 mb-4">
            Say: <span className="text-zinc-300">"Team A Raj Nitin Vipul Team B Rahul Siraj Amit"</span>
            <br />
            <span className="text-zinc-600 mt-0.5 block">Tip: speak clearly; new names not in the list will be created automatically.</span>
          </p>

          <div className="flex flex-col items-center gap-4">
            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={micState === 'listening' ? stopListening : undefined}
              disabled={micState === 'processing'}
              className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-lg ${
                micState === 'listening'
                  ? 'bg-red-500 scale-110 shadow-red-500/30 animate-pulse'
                  : micState === 'processing'
                    ? 'bg-zinc-700 opacity-50'
                    : 'bg-emerald-500 active:scale-95 shadow-emerald-500/20'
              }`}
            >
              🎙
            </button>
            <p className="text-xs text-zinc-500">
              {micState === 'listening' ? 'Listening… release when done' : micState === 'processing' ? 'Processing…' : 'Hold to speak'}
            </p>
          </div>

          {transcript && (
            <div className="mt-4 bg-zinc-800 rounded-lg p-3">
              <p className="text-xs text-zinc-400 mb-1">Live transcript:</p>
              <p className="text-sm text-white">{transcript}</p>
            </div>
          )}
        </>
      )}

      {step === 'review' && (
        <>
          <p className="text-xs text-zinc-400 mb-1">Transcript: <span className="text-zinc-500">{transcript}</span></p>

          {preview.length === 0 && unmatched.length === 0 && (
            <div className="py-3 text-sm text-amber-400 text-center">
              No team labels recognised. Make sure you say "Team A" or "Team B" clearly before the names.
            </div>
          )}

          {preview.length > 0 && (
            <div className="flex flex-col gap-1.5 my-3">
              <p className="text-xs text-zinc-400">Matched ({preview.length}):</p>
              {preview.map((a) => (
                <div key={a.participation.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                  <span className="text-sm text-white">{a.participation.player?.name}</span>
                  <span className="text-xs font-medium text-emerald-400">→ {a.teamName}</span>
                </div>
              ))}
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              <p className="text-xs text-amber-400">Not in participant list — will be created as new players:</p>
              {unmatched.map((u, i) => (
                <div key={i} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-2">
                  <span className="text-sm text-amber-300 flex-1">{u.spokenName}</span>
                  <select
                    value={u.teamId}
                    onChange={(e) => updateUnmatchedTeam(i, e.target.value)}
                    className="text-xs bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-white"
                  >
                    <option value={teamA.id}>{teamA.name}</option>
                    <option value={teamB.id}>{teamB.name}</option>
                  </select>
                  <button onClick={() => removeUnmatched(i)} className="text-zinc-500 text-xs px-1">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            {(preview.length > 0 || unmatched.length > 0) && (
              <button
                onClick={handleConfirm}
                disabled={applying}
                className="flex-1 bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm"
              >
                {applying ? 'Applying…' : `Apply ${preview.length + unmatched.length} Assignment${preview.length + unmatched.length !== 1 ? 's' : ''}`}
              </button>
            )}
            <button
              onClick={() => { setStep('record'); setTranscript(''); setPreview([]); setUnmatched([]) }}
              className="flex-1 bg-zinc-800 text-zinc-300 rounded-lg py-2.5 text-sm"
            >
              Try Again
            </button>
          </div>
        </>
      )}
    </div>
  )
}
