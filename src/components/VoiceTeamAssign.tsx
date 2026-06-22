import { useEffect, useRef, useState } from 'react'
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

    // Normalise — but preserve capitalisation for display
    const normalised = raw
      .replace(/[,:;.!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const words = normalised.split(/\s+/).filter(Boolean)

    // Walk word by word, detect "team <label>" markers
    const sections: Array<{ side: 'A' | 'B'; nameWords: string[] }> = []
    let currentSection: { side: 'A' | 'B'; nameWords: string[] } | null = null

    let i = 0
    while (i < words.length) {
      if (words[i].toLowerCase() === 'team' && i + 1 < words.length) {
        const side = detectTeamSide(words[i + 1].toLowerCase())
        if (side !== null) {
          currentSection = { side, nameWords: [] }
          sections.push(currentSection)
          i += 2
          continue
        }
      }
      if (currentSection) {
        currentSection.nameWords.push(words[i])
      }
      i++
    }

    // Build participant name lookup for grouping hints only —
    // used to decide if two adjacent words form one name (e.g. "Raj Sharma"),
    // but NOT used to gate who gets assigned. Everyone gets assigned.
    const knownNames = participants.map((p) => p.player?.name?.toLowerCase() ?? '')

    const allEntries: VoiceUnmatched[] = []

    for (const section of sections) {
      const teamId = section.side === 'A' ? teamA.id : teamB.id
      const teamName = section.side === 'A' ? teamA.name : teamB.name
      const nameWords = section.nameWords

      let j = 0
      while (j < nameWords.length) {
        let nameEntry: string
        // Try 2-word grouping if combined matches a known participant name
        if (
          j + 1 < nameWords.length &&
          knownNames.some((n) =>
            n === `${nameWords[j]} ${nameWords[j + 1]}`.toLowerCase()
          )
        ) {
          nameEntry = `${nameWords[j]} ${nameWords[j + 1]}`
          j += 2
        } else {
          nameEntry = nameWords[j].charAt(0).toUpperCase() + nameWords[j].slice(1)
          j++
        }
        allEntries.push({ spokenName: nameEntry, teamId, teamName })
      }
    }

    setUnmatched(allEntries)
    setStep('review')
  }

  async function handleConfirm() {
    setApplying(true)
    try {
      const allAssignments: VoiceAssignment[] = []

      for (const u of unmatched) {
        if (!u.spokenName.trim() || !u.teamId) continue

        // Check if this name matches an existing confirmed participant (exact, case-insensitive)
        const existingParticipation = participants.find(
          (p) => p.player?.name?.toLowerCase() === u.spokenName.trim().toLowerCase()
        )

        if (existingParticipation) {
          // Reuse existing participation record
          allAssignments.push({
            participation: existingParticipation,
            teamId: u.teamId,
            teamName: u.teamName,
          })
        } else {
          // Create new player + participation
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({ name: u.spokenName.trim(), mobile_number: null })
            .select()
            .single()
          if (playerError) continue

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

          allAssignments.push({
            participation: {
              id: newParticipation.id,
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
      }

      onAssignments(allAssignments)
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

          {unmatched.length === 0 && (
            <div className="py-3 text-sm text-amber-400 text-center">
              No team labels recognised. Say "Team A" or "Team B" clearly before the names.
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="flex flex-col gap-1.5 my-3">
              <p className="text-xs text-zinc-400 mb-1">
                Edit names/teams if needed, then confirm:
              </p>
              {unmatched.map((u, i) => (
                <div key={i} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                  <input
                    type="text"
                    value={u.spokenName}
                    onChange={(e) =>
                      setUnmatched((prev) =>
                        prev.map((r, ri) => ri === i ? { ...r, spokenName: e.target.value } : r)
                      )
                    }
                    className="flex-1 bg-transparent text-sm text-white outline-none border-b border-zinc-600 focus:border-emerald-500 py-0.5"
                  />
                  <select
                    value={u.teamId}
                    onChange={(e) => updateUnmatchedTeam(i, e.target.value)}
                    className="text-xs bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-white shrink-0"
                  >
                    <option value={teamA.id}>{teamA.name}</option>
                    <option value={teamB.id}>{teamB.name}</option>
                  </select>
                  <button onClick={() => removeUnmatched(i)} className="text-zinc-500 text-xs px-1 shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            {unmatched.length > 0 && (
              <button
                onClick={handleConfirm}
                disabled={applying}
                className="flex-1 bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm"
              >
                {applying ? 'Applying…' : `Assign ${unmatched.length} Player${unmatched.length !== 1 ? 's' : ''}`}
              </button>
            )}
            <button
              onClick={() => { setStep('record'); setTranscript(''); setUnmatched([]) }}
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
