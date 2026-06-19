import { useEffect, useRef, useState } from 'react'
import { fuzzyMatchName } from '../lib/fuzzyMatch'
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
}

interface Props {
  teamA: Team
  teamB: Team
  participants: Participation[]
  onAssignments: (assignments: VoiceAssignment[], unmatched: VoiceUnmatched[]) => void
  onClose: () => void
}

type MicState = 'idle' | 'listening' | 'processing'

export default function VoiceTeamAssign({ teamA, teamB, participants, onAssignments, onClose }: Props) {
  const [micState, setMicState] = useState<MicState>('idle')
  const [transcript, setTranscript] = useState('')
  const [preview, setPreview] = useState<VoiceAssignment[]>([])
  const [unmatched, setUnmatched] = useState<VoiceUnmatched[]>([])
  const [step, setStep] = useState<'record' | 'review'>('record')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Check support once on mount — done outside effect to avoid setState-in-effect lint rule
  const isSpeechSupported = !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
    }
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

    recognition.onerror = () => {
      setMicState('idle')
    }

    recognition.onend = () => {
      setMicState('idle')
    }

    setTranscript('')
    setMicState('listening')
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setMicState('processing')
    // give onend event time to fire, then parse
    setTimeout(() => {
      parseAndPreview()
      setMicState('idle')
    }, 400)
  }

  function parseAndPreview() {
    // Parse spoken text into team assignments
    // Expected speech: "Team A Raj Nitin Vipul Team B Rahul Siraj Amit"
    // or variations like: "Team A: Raj, Nitin... Team B: Rahul, Siraj..."

    const raw = transcript.trim()
    if (!raw) return

    const candidates = participants.map((p) => ({
      id: p.id,
      name: p.player?.name ?? '',
    }))

    // Normalise: remove punctuation, lowercase
    const normalised = raw
      .toLowerCase()
      .replace(/[,:;.!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Split on "team a" / "team b" (and common variants)
    // Capture everything after each label until the next label or end
    const sections: Array<{ side: 'A' | 'B'; text: string }> = []

    // Replace "team a"/"team b" with sentinel markers
    const marked = normalised
      .replace(/\bteam\s+a\b/g, '|TEAM_A|')
      .replace(/\bteam\s+b\b/g, '|TEAM_B|')

    const parts = marked.split('|').filter((p) => p.trim())

    for (const part of parts) {
      if (part === 'TEAM_A') {
        sections.push({ side: 'A', text: '' })
      } else if (part === 'TEAM_B') {
        sections.push({ side: 'B', text: '' })
      } else if (sections.length > 0) {
        sections[sections.length - 1].text += part
      }
    }

    const assignments: VoiceAssignment[] = []
    const unmatchedNames: VoiceUnmatched[] = []
    const usedParticipationIds = new Set<string>()

    for (const section of sections) {
      const teamId = section.side === 'A' ? teamA.id : teamB.id
      const teamName = section.side === 'A' ? teamA.name : teamB.name

      // Split spoken names by whitespace or comma
      // Each "word" or "comma-group" is a potential name fragment
      // Strategy: try matching progressively longer word sequences
      const words = section.text.trim().split(/\s+/).filter(Boolean)

      let i = 0
      while (i < words.length) {
        let matched = false

        // Try matching 3-word, 2-word, then 1-word sequences (handles multi-word names)
        for (let len = Math.min(3, words.length - i); len >= 1; len--) {
          const nameTry = words.slice(i, i + len).join(' ')
          const result = fuzzyMatchName(nameTry, candidates)

          if (result && !usedParticipationIds.has(result.candidate.id)) {
            const participation = participants.find((p) => p.id === result.candidate.id)
            if (participation) {
              assignments.push({ participation, teamId, teamName })
              usedParticipationIds.add(result.candidate.id)
              i += len
              matched = true
              break
            }
          }
        }

        if (!matched) {
          // Single unmatched word — skip it (likely filler like "and", "then")
          // but flag multi-character words that look like name attempts
          if (words[i].length > 3) {
            unmatchedNames.push({ spokenName: words[i] })
          }
          i++
        }
      }
    }

    setPreview(assignments)
    setUnmatched(unmatchedNames)
    if (assignments.length > 0 || unmatchedNames.length > 0) {
      setStep('review')
    }
  }

  function handleConfirm() {
    onAssignments(preview, unmatched)
    onClose()
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
          On iOS, voice input requires Safari 14.1+.
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
            Tap the mic and say: <span className="text-zinc-300">"Team A Raj Nitin Vipul Team B Rahul Siraj Amit"</span>
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
              {micState === 'listening'
                ? 'Listening… release when done'
                : micState === 'processing'
                  ? 'Processing…'
                  : 'Hold to speak'}
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
          <p className="text-xs text-zinc-400 mb-3">Review before applying:</p>

          {preview.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
              {preview.map((a) => (
                <div
                  key={a.participation.id}
                  className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-white">{a.participation.player?.name}</span>
                  <span className="text-xs font-medium text-emerald-400">→ {a.teamName}</span>
                </div>
              ))}
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-amber-400 mb-1">
                Could not match — assign manually below:
              </p>
              {unmatched.map((u, i) => (
                <span
                  key={i}
                  className="inline-block text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2 py-0.5 mr-1 mb-1"
                >
                  {u.spokenName}
                </span>
              ))}
            </div>
          )}

          {preview.length === 0 && unmatched.length === 0 && (
            <p className="text-sm text-zinc-500 mb-3">No names recognised. Try again.</p>
          )}

          <div className="flex gap-2">
            {preview.length > 0 && (
              <button
                onClick={handleConfirm}
                className="flex-1 bg-emerald-500 active:bg-emerald-600 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm"
              >
                Apply {preview.length} Assignment{preview.length !== 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => {
                setStep('record')
                setTranscript('')
                setPreview([])
                setUnmatched([])
              }}
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
