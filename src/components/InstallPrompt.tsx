import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa_dismissed') === '1')

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!installEvent || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex items-center gap-3 shadow-xl z-50">
      <span className="text-2xl">🏏</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">Install MatchMates</p>
        <p className="text-xs text-zinc-400">Add to home screen for quick access</p>
      </div>
      <button
        onClick={() => { setDismissed(true); localStorage.setItem('pwa_dismissed', '1') }}
        className="text-zinc-500 text-xs px-2"
      >
        ✕
      </button>
      <button
        onClick={async () => {
          await installEvent.prompt()
          const { outcome } = await installEvent.userChoice
          if (outcome === 'accepted') setInstallEvent(null)
        }}
        className="bg-emerald-500 text-zinc-950 font-semibold text-sm px-3 py-1.5 rounded-lg"
      >
        Install
      </button>
    </div>
  )
}
