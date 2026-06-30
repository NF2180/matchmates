import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Player } from '../types'
import MergePlayersTool from '../components/MergePlayersTool'

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET_1 as string | undefined
console.log('ADMIN_SECRET set:', !!ADMIN_SECRET, 'length:', ADMIN_SECRET?.length)

export default function AdminPlayers() {
  const [unlocked, setUnlocked] = useState(!ADMIN_SECRET)
  const [secretInput, setSecretInput] = useState('')
  const [secretError, setSecretError] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [showAddSingle, setShowAddSingle] = useState(false)
  const [addName, setAddName] = useState('')
  const [addMobile, setAddMobile] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [showBulkRegistry, setShowBulkRegistry] = useState(false)
  const [bulkRegistryText, setBulkRegistryText] = useState('')
  const [bulkRegistryAdding, setBulkRegistryAdding] = useState(false)
  const [bulkRegistryResult, setBulkRegistryResult] = useState<string | null>(null)

  async function addSingleToRegistry(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim()) return
    setAddingPlayer(true)
    setAddError(null)
    try {
      const { error } = await supabase.from('players').insert({
        name: addName.trim(),
        mobile_number: addMobile.trim() || null,
      })
      if (error) throw error
      setAddName('')
      setAddMobile('')
      setShowAddSingle(false)
      await loadPlayers()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add player')
    } finally {
      setAddingPlayer(false)
    }
  }

  const [bulkRegistryStep, setBulkRegistryStep] = useState<'paste' | 'review'>('paste')
  const [bulkRegistryRows, setBulkRegistryRows] = useState<Array<{
    inputName: string
    existingMatch: { id: string; name: string } | null
    useExisting: boolean
  }>>([])

  async function prepareBulkRegistry() {
    if (!bulkRegistryText.trim()) return
    setBulkRegistryAdding(true)
    const names = bulkRegistryText.split('\n').map((l) => l.trim()).filter(Boolean)
    const candidates = players.map((p) => ({ id: p.id, name: p.name }))
    const { fuzzyMatchName } = await import('../lib/fuzzyMatch')
    const rows = names.map((inputName) => {
      const result = fuzzyMatchName(inputName, candidates)
      return {
        inputName,
        existingMatch: result ? { id: result.candidate.id, name: result.candidate.name } : null,
        useExisting: !!result,
      }
    })
    setBulkRegistryRows(rows)
    setBulkRegistryAdding(false)
    setBulkRegistryStep('review')
  }

  async function applyBulkRegistry() {
    setBulkRegistryAdding(true)
    let added = 0
    let skipped = 0
    for (const row of bulkRegistryRows) {
      if (row.useExisting) { skipped++; continue }
      const { error } = await supabase.from('players').insert({ name: row.inputName, mobile_number: null })
      if (error) skipped++
      else added++
    }
    setBulkRegistryResult(`Added ${added} to registry${skipped > 0 ? `, ${skipped} merged/skipped` : ''}`)
    setBulkRegistryText('')
    setBulkRegistryStep('paste')
    setBulkRegistryRows([])
    await loadPlayers()
    setBulkRegistryAdding(false)
  }

  const loadPlayers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      setPlayers((data as Player[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPlayers()
  }, [loadPlayers])

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditMobile(p.mobile_number ?? '')
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  async function deletePlayer(playerId: string, playerName: string) {
    if (!confirm(`Permanently delete "${playerName}" from the registry? This removes them from all matches and cannot be undone.`)) return
    try {
      // Cascade: delete team_members → participation → player
      const { data: parts } = await supabase.from('participation').select('id').eq('player_id', playerId)
      for (const p of parts ?? []) {
        await supabase.from('team_members').delete().eq('participation_id', p.id)
      }
      await supabase.from('participation').delete().eq('player_id', playerId)
      const { error } = await supabase.from('players').delete().eq('id', playerId)
      if (error) throw error
      await loadPlayers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed — run migration 005 in Supabase SQL Editor first')
    }
  }

  async function saveEdit(playerId: string) {

    const trimmedMobile = editMobile.trim()
    if (trimmedMobile && !/^[0-9]{10}$/.test(trimmedMobile)) {
      setSaveError('Mobile number must be exactly 10 digits, or leave it blank')
      return
    }
    if (!editName.trim()) {
      setSaveError('Name cannot be empty')
      return
    }

    setSaving(true)
    try {
      // if setting a mobile number, check it doesn't collide with another player
      if (trimmedMobile) {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('mobile_number', trimmedMobile)
          .neq('id', playerId)
          .maybeSingle()

        if (existing) {
          setSaveError('Another player already has this mobile number')
          setSaving(false)
          return
        }
      }

      const { error: updateError } = await supabase
        .from('players')
        .update({
          name: editName.trim(),
          mobile_number: trimmedMobile || null,
        })
        .eq('id', playerId)

      if (updateError) throw updateError

      setEditingId(null)
      await loadPlayers()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const filtered = players.filter((p) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.mobile_number ?? '').includes(q)
  })

  const missingMobileCount = players.filter((p) => !p.mobile_number && !isGuestMobile(p.mobile_number)).length

  if (!unlocked) {
    return (
      <div className="flex flex-col flex-1 px-4 pb-10">
        <header className="pt-6 pb-4">
          <Link to="/" className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
          <h1 className="text-xl font-bold text-white">Admin · Players</h1>
        </header>
        <div className="flex flex-col gap-3 mt-4">
          <p className="text-sm text-zinc-400">Enter the admin password to continue.</p>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => { setSecretInput(e.target.value); setSecretError(false) }}
            placeholder="Admin password"
            className="input"
            autoFocus
          />
          {secretError && <p className="text-red-400 text-sm">Incorrect password.</p>}
          <button
            onClick={() => {
              if (secretInput === ADMIN_SECRET) { setUnlocked(true) }
              else { setSecretError(true) }
            }}
            className="w-full bg-emerald-500 text-zinc-950 font-semibold rounded-xl py-3 text-sm"
          >
            Unlock
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        <Link to="/" className="text-sm text-zinc-500 mb-2 inline-block">← Back</Link>
        <h1 className="text-xl font-bold text-white">Admin · Players</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage player profiles and mobile numbers
        </p>
        {missingMobileCount > 0 && (
          <p className="text-xs text-amber-400 mt-2">
            {missingMobileCount} player{missingMobileCount !== 1 ? 's' : ''} without a mobile number
          </p>
        )}
      </header>

      <div className="flex flex-col gap-2 mb-4">
        {!showAddSingle && !showBulkRegistry && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddSingle(true)}
              className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium rounded-xl py-3 text-sm"
            >
              + Add Player
            </button>
            <button
              onClick={() => setShowBulkRegistry(true)}
              className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium rounded-xl py-3 text-sm"
            >
              📋 Bulk Add
            </button>
          </div>
        )}

        {showAddSingle && (
          <form onSubmit={addSingleToRegistry} className="flex flex-col gap-2">
            <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" className="input" autoFocus />
            <input type="tel" value={addMobile} onChange={(e) => setAddMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Mobile (optional)" className="input" />
            {addError && <p className="text-red-400 text-xs">{addError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={addingPlayer || !addName.trim()} className="flex-1 bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50">
                {addingPlayer ? 'Adding…' : 'Add to Registry'}
              </button>
              <button type="button" onClick={() => { setShowAddSingle(false); setAddName(''); setAddMobile(''); setAddError(null) }} className="px-4 bg-zinc-800 text-zinc-400 rounded-lg text-sm">✕</button>
            </div>
          </form>
        )}

        {showBulkRegistry && bulkRegistryStep === 'paste' && (
          <form onSubmit={(e) => { e.preventDefault(); prepareBulkRegistry() }} className="flex flex-col gap-2">
            <textarea value={bulkRegistryText} onChange={(e) => setBulkRegistryText(e.target.value)} placeholder={'Names, one per line:\nRaj\nNitin\nVipul'} className="input min-h-[120px] resize-none" autoFocus />
            {bulkRegistryResult && <p className="text-sm text-emerald-400">{bulkRegistryResult}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={bulkRegistryAdding || !bulkRegistryText.trim()} className="flex-1 bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50">
                {bulkRegistryAdding ? 'Checking…' : 'Review'}
              </button>
              <button type="button" onClick={() => { setShowBulkRegistry(false); setBulkRegistryText(''); setBulkRegistryResult(null) }} className="px-4 bg-zinc-800 text-zinc-400 rounded-lg text-sm">✕</button>
            </div>
          </form>
        )}

        {showBulkRegistry && bulkRegistryStep === 'review' && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-400">Review before adding to registry:</p>
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
              {bulkRegistryRows.map((row, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{row.inputName}</span>
                    {row.existingMatch ? (
                      <button
                        onClick={() => setBulkRegistryRows((prev) => prev.map((r, ri) => ri === i ? { ...r, useExisting: !r.useExisting } : r))}
                        className={`text-xs px-2 py-0.5 rounded border ${row.useExisting ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
                      >
                        {row.useExisting ? `✓ Same as "${row.existingMatch.name}"` : '+ Create new'}
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-400">New</span>
                    )}
                  </div>
                  {row.existingMatch && (
                    <p className="text-xs text-zinc-500 mt-0.5">Close match found: {row.existingMatch.name} — tap to toggle</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={applyBulkRegistry} disabled={bulkRegistryAdding} className="flex-1 bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50">
                {bulkRegistryAdding ? 'Adding…' : `Add ${bulkRegistryRows.filter((r) => !r.useExisting).length} New Players`}
              </button>
              <button onClick={() => setBulkRegistryStep('paste')} className="px-4 bg-zinc-800 text-zinc-400 rounded-lg text-sm">Back</button>
            </div>
          </div>
        )}

        <MergePlayersTool players={players} onMerged={loadPlayers} />
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or number"
        className="input mb-4"
      />

      {loading && <div className="text-zinc-500 text-sm py-8 text-center">Loading players…</div>}

      {error && (
        <div className="text-red-400 text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-zinc-600 text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
          No players found
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            {editingId === p.id ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Name"
                  className="input py-2 text-sm"
                  autoFocus
                />
                <input
                  type="tel"
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Mobile number (optional)"
                  className="input py-2 text-sm"
                />
                {saveError && <div className="text-red-400 text-xs">{saveError}</div>}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => saveEdit(p.id)}
                    disabled={saving}
                    className="flex-1 bg-emerald-500 text-zinc-950 font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="px-4 bg-zinc-800 text-zinc-400 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
                  {p.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/player/${p.id}`} className="text-sm text-white truncate active:text-emerald-400">
                    {p.name}
                  </Link>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {isGuestMobile(p.mobile_number) ? (
                      <span className="text-zinc-600">Guest player</span>
                    ) : p.mobile_number ? (
                      p.mobile_number
                    ) : (
                      <span className="text-amber-500">No mobile number</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="text-emerald-400 text-xs px-2 py-1 shrink-0"
                >
                  Edit
                </button>
                <button
                  onClick={() => deletePlayer(p.id, p.name)}
                  className="text-red-400 text-xs px-2 py-1 shrink-0"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function isGuestMobile(mobile: string | null): boolean {
  return !!mobile && mobile.startsWith('guest_')
}
