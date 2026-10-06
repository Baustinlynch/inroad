import { firstRunCampaign, firstRunVoice, type Campaign, type Prospect, type Voice } from './data'

// Everything worth keeping between launches. UI-only state (open panels,
// filters, theme) lives elsewhere.
export interface SavedState {
  version: 1
  prospects: Prospect[]
  campaigns: Campaign[]
  voices: Voice[]
  campaignId: string
  selectedId: string
}

function firstRun(): SavedState {
  const voice = firstRunVoice()
  const campaign = firstRunCampaign(voice.id)
  return { version: 1, prospects: [], campaigns: [campaign], voices: [voice], campaignId: campaign.id, selectedId: '' }
}

// Claude work doesn't survive a restart: research that was running goes back
// in the queue, and a chat reply that was being written is marked as cut off.
function resume(state: SavedState): SavedState {
  return {
    ...state,
    prospects: state.prospects.map((p) => ({
      ...p,
      status: p.status === 'researching' ? 'queued' : p.status,
      chats: p.chats.map((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.pending ? { ...m, pending: false, error: true, text: m.text || 'Interrupted when Inroad closed.' } : m)),
      })),
    })),
  }
}

export async function loadSaved(): Promise<SavedState> {
  const saved = (await window.api?.store.load()) as SavedState | null | undefined
  return saved?.version === 1 ? resume(saved) : firstRun()
}

// Debounced so typing in the editor doesn't write the file on every keystroke.
let timer: ReturnType<typeof setTimeout> | undefined
export function persist(state: SavedState) {
  if (!window.api) return
  clearTimeout(timer)
  timer = setTimeout(() => window.api!.store.save(state).catch((err) => console.error('Failed to save', err)), 400)
}
