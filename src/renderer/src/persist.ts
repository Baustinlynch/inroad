import { initialCampaigns, initialProspects, initialVoices, type Campaign, type Prospect, type Voice } from './data'

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

export const demoState = (): SavedState => ({
  version: 1,
  prospects: initialProspects,
  campaigns: initialCampaigns,
  voices: initialVoices,
  campaignId: 'sponsors',
  selectedId: 'lumen',
})

export async function loadSaved(): Promise<SavedState> {
  const saved = (await window.api?.store.load()) as SavedState | null | undefined
  return saved?.version === 1 ? saved : demoState()
}

// Debounced so typing in the editor doesn't write the file on every keystroke.
let timer: ReturnType<typeof setTimeout> | undefined
export function persist(state: SavedState) {
  if (!window.api) return
  clearTimeout(timer)
  timer = setTimeout(() => window.api!.store.save(state).catch((err) => console.error('Failed to save', err)), 400)
}
