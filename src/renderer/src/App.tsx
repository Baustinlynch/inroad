import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Flag,
  GitCompare,
  Inbox,
  Keyboard,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  PanelRight,
  PenLine,
  Plus,
  Redo2,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePanelRef } from 'react-resizable-panels'
import { toast } from 'sonner'
import { CommandPalette, ShortcutsDialog, type PaletteCommand } from './components/CommandPalette'
import { AddCompaniesDialog, ProfilesDialog, type ProfilesTarget } from './components/Modals'
import { Editor } from './components/Editor'
import { activeChat, RightPanel, type Tab } from './components/RightPanel'
import { TrashView, type TrashItem } from './components/TrashView'
import { AppSidebar, inFilter, type Filter } from './components/Sidebar'
import { statusStyle } from './components/status'
import { useBreakpoint } from './layout'
import { MAX_VOICE_EXAMPLES, type Campaign, type ChatMsg, type ChatThread, type Prospect, type Version, type Voice } from './data'
import type { ClaudeProgress, DraftRef, PublicSettings, VoiceInput } from '../../shared/api'
import { persist, type SavedState } from './persist'
import { htmlHasText, htmlToText, replaceText, textToHtml } from './richtext'
import { SettingsDialog } from './components/SettingsDialog'
import { currentEditor, historyDepth, undoBridge, type UndoEntry } from './undo'

const MAX_CONCURRENT = 3
// How long a save is held back before it touches the mailbox; undoing inside
// this window cancels it rather than having to delete the draft.
const UNDO_GRACE_MS = 5000
type Theme = 'dark' | 'light'

const needsReview = (p: Prospect) => p.status === 'drafted' || p.status === 'edited'
const hasText = (p: Prospect | undefined, text: string) => !!p && !!text && (p.subject.includes(text) || htmlHasText(p.body, text))
const statusAfter = (p: Prospect, body: string): Prospect['status'] => (p.status === 'saved' ? 'saved' : body !== p.originalBody ? 'edited' : 'drafted')

interface Toast {
  text: string
  undo?: boolean
  redo?: boolean
  action?: { label: string; run: () => void }
}

// What one save taught Claude about how you write, so it can be undone.
interface VoiceChange {
  voiceId: string
  at: number
  add: string[]
  remove: string[]
  example: { draft: string; final: string }
}

function loadTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export default function App({ saved }: { saved: SavedState }) {
  const [prospects, setProspects] = useState(saved.prospects)
  const [campaigns, setCampaigns] = useState(saved.campaigns)
  const [voices, setVoices] = useState(saved.voices)
  // Main area: the selected email, or the Deleted items page.
  const [view, setView] = useState<'email' | 'trash'>('email')
  const [campaignId, setCampaignId] = useState(saved.campaignId)
  const [selectedId, setSelectedId] = useState(saved.selectedId)

  // Persist to disk (Electron only) whenever the saved state changes.
  useEffect(() => {
    persist({ version: 1, prospects, campaigns, voices, campaignId, selectedId })
  }, [prospects, campaigns, voices, campaignId, selectedId])
  const [tab, setTab] = useState<Tab>('chat')
  const [filter, setFilter] = useState<Filter>('all')
  const [showDiff, setShowDiff] = useState(false)
  const [adding, setAdding] = useState(false)
  const [profiles, setProfiles] = useState<null | ProfilesTarget>(null)
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  // Mailbox & API key settings (secrets stay in the main process).
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => {
    window.api?.settings.get().then(setSettings)
  }, [])

  // Layout. The left sidebar (shadcn Sidebar) collapses to icons on narrower
  // screens and becomes a sheet on phones. The brief/chat panel docks in a
  // resizable group on wide screens and slides over as a sheet otherwise.
  const bp = useBreakpoint()
  const rightDocks = bp === 'wide'
  const [leftOpen, setLeftOpen] = useState(bp === 'wide' || bp === 'medium')
  const [rightOpen, setRightOpen] = useState(rightDocks)
  useEffect(() => {
    setLeftOpen(bp === 'wide' || bp === 'medium')
    setRightOpen(bp === 'wide')
  }, [bp])
  const rightPanelRef = usePanelRef()
  // Keep the docked panel in step with rightOpen (toggled by buttons and keys).
  useEffect(() => {
    const panel = rightPanelRef.current
    if (!rightDocks || !panel) return
    if (rightOpen && panel.isCollapsed()) panel.expand()
    if (!rightOpen && !panel.isCollapsed()) panel.collapse()
  }, [rightOpen, rightDocks, rightPanelRef])

  // Soft delete: anything with deletedAt is hidden everywhere except Deleted items.
  const aliveCampaigns = campaigns.filter((c) => !c.deletedAt)
  const aliveVoices = voices.filter((v) => !v.deletedAt)
  // If the open campaign was deleted, fall back to the first one left.
  const campaign = aliveCampaigns.find((c) => c.id === campaignId) ?? aliveCampaigns[0]
  const inCampaign = prospects.filter((p) => p.campaignId === campaign.id && !p.deletedAt)
  // Undefined when the campaign is empty (e.g. just created).
  const selected = inCampaign.find((p) => p.id === selectedId)
  const shown = inCampaign.filter((p) => inFilter[filter](p.status))
  const update = (id: string, fn: (p: Prospect) => Prospect) => setProspects((ps) => ps.map((p) => (p.id === id ? fn(p) : p)))
  const overlayOpen = adding || !!profiles || palette || help || settingsOpen || (!rightDocks && rightOpen)
  // Latest state for callbacks that run later (timers, undo closures).
  const prospectsRef = useRef(prospects)
  prospectsRef.current = prospects
  const get = (id: string) => prospectsRef.current.find((p) => p.id === id)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // Storage can be unavailable (private mode); theme just won't persist.
    }
  }, [theme])

  // ---- Claude ----
  // Latest campaigns/voices/settings for async work that finishes later.
  const campaignsRef = useRef(campaigns)
  campaignsRef.current = campaigns
  const voicesRef = useRef(voices)
  voicesRef.current = voices
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Streamed progress (research steps, chat text) is routed to whoever started the job.
  const jobs = useRef(new Map<string, (e: ClaudeProgress) => void>())
  useEffect(() => window.api?.claude.onProgress((e) => jobs.current.get(e.jobId)?.(e)), [])

  const voiceOf = (campaignId: string): Voice => {
    const vs = voicesRef.current.filter((v) => !v.deletedAt)
    const c = campaignsRef.current.find((c) => c.id === campaignId)
    return vs.find((v) => v.id === c?.voiceId) ?? vs[0]
  }
  const voiceInput = (v: Voice): VoiceInput => ({
    name: v.name,
    notes: v.notes.filter((n) => !n.deletedAt).map((n) => n.text),
    examples: v.examples ?? [],
  })
  const claudeContext = (p: Prospect) => ({
    company: p.company,
    campaignNotes: campaignsRef.current.find((c) => c.id === p.campaignId)?.notes ?? '',
    voice: voiceInput(voiceOf(p.campaignId)),
    senderName: settingsRef.current?.mail?.fromName ?? '',
  })

  // Research runner: pulls from the queue so at most MAX_CONCURRENT run at once.
  const researching = useRef(new Set<string>())
  const research = async (p: Prospect) => {
    const pid = p.id
    researching.current.add(pid)
    update(pid, (q) => ({ ...q, status: 'researching', progress: [], error: undefined }))
    const jobId = crypto.randomUUID()
    jobs.current.set(jobId, (e) => e.kind === 'step' && update(pid, (q) => ({ ...q, progress: [...q.progress, e.text] })))
    const res = window.api
      ? await window.api.claude.research({ jobId, website: p.domain || undefined, ...claudeContext(p) })
      : ({ ok: false, error: 'Research runs in the Inroad desktop app.' } as const)
    jobs.current.delete(jobId)
    researching.current.delete(pid)
    if (!res.ok) return update(pid, (q) => ({ ...q, status: 'failed', error: res.error }))
    const { research, draft } = res.value
    const html = textToHtml(draft.body)
    update(pid, (q) => ({
      ...q,
      status: 'drafted',
      research,
      brief: draft.brief,
      subject: draft.subject,
      body: html,
      originalBody: html,
      to: draft.to ? [draft.to] : [],
      versions: [...q.versions, { id: crypto.randomUUID(), label: 'Claude’s draft', by: 'claude', at: Date.now(), html }],
    }))
  }
  useEffect(() => {
    let free = MAX_CONCURRENT - researching.current.size
    for (const p of prospects) {
      if (free <= 0) break
      if (p.status !== 'queued' || p.deletedAt || researching.current.has(p.id)) continue
      free--
      void research(p)
    }
  })

  // One toast at a time (same id), with Undo / Redo where it applies.
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const notify = (t: Toast) =>
    toast(t.text, {
      id: 'app',
      duration: UNDO_GRACE_MS,
      action: t.undo
        ? { label: 'Undo', onClick: () => undoRef.current() }
        : t.redo
          ? { label: 'Redo', onClick: () => redoRef.current() }
          : t.action
            ? { label: t.action.label, onClick: t.action.run }
            : undefined,
    })

  const select = (id: string) => {
    setView('email')
    setSelectedId(id)
    setShowDiff(false)
  }

  const step = (delta: number) => {
    if (!shown.length) return
    const i = shown.findIndex((p) => p.id === selectedId)
    const next = i < 0 ? 0 : Math.min(Math.max(i + delta, 0), shown.length - 1)
    select(shown[next].id)
  }

  // Next prospect after the current one (wrapping) that still needs review.
  const nextReviewId = (fromId: string, ps = inCampaign) => {
    const i = ps.findIndex((p) => p.id === fromId)
    const ordered = [...ps.slice(i + 1), ...ps.slice(0, i)]
    return ordered.find(needsReview)?.id
  }

  const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

  // ---- Undo (see undo.ts for how this shares ⌘Z with the editor) ----
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])
  // A plain text box typed in since the last app action keeps its native ⌘Z.
  const dirtyInput = useRef<EventTarget | null>(null)
  useEffect(() => {
    const onInput = (e: Event) => {
      const t = e.target as HTMLElement
      if (!t.closest?.('#email-body')) dirtyInput.current = t
    }
    document.addEventListener('input', onInput)
    return () => document.removeEventListener('input', onInput)
  }, [])

  const editorMark = () => {
    const editor = currentEditor()
    return { editor, editorDepth: editor ? historyDepth(editor.state) : 0 }
  }

  const record = (label: string, prospectId: string | undefined, undo: UndoEntry['undo'], redo: UndoEntry['redo'], toastText = label) => {
    undoStack.current.push({ label, prospectId, ...editorMark(), undo, redo })
    redoStack.current = []
    dirtyInput.current = null
    notify({ text: toastText, undo: true })
  }

  const goTo = (id?: string) => {
    const p = id && get(id)
    if (!p) return
    if (p.campaignId !== campaignId) setCampaignId(p.campaignId)
    if (p.id !== selectedId) select(p.id)
  }

  const appUndo = () => {
    const entry = undoStack.current.pop()
    if (!entry) return notify({ text: 'Nothing to undo' })
    goTo(entry.prospectId)
    const note = entry.undo()
    redoStack.current.push(entry)
    dirtyInput.current = null
    notify({ text: note || `Undid: ${entry.label}`, redo: true })
  }

  const appRedo = () => {
    const entry = redoStack.current.pop()
    if (!entry) return notify({ text: 'Nothing to redo' })
    goTo(entry.prospectId)
    entry.redo()
    undoStack.current.push({ ...entry, ...editorMark() })
    dirtyInput.current = null
    notify({ text: `Redid: ${entry.label}`, undo: true })
  }

  // The editor asks before handling ⌘Z: if the newest app action is more
  // recent than the typing in this editor, the app undoes that instead.
  undoRef.current = appUndo
  redoRef.current = appRedo
  undoBridge.undo = (editor, depth) => {
    const top = undoStack.current.at(-1)
    if (!top) return false
    const appIsNewer = top.editor === editor ? depth <= top.editorDepth : depth === 0
    if (!appIsNewer) return false
    appUndo()
    return true
  }
  undoBridge.redo = (depth) => {
    if (depth > 0 || !redoStack.current.length) return false
    appRedo()
    return true
  }

  const switchCampaign = (id: string) => {
    setCampaignId(id)
    const list = prospects.filter((p) => p.campaignId === id && !p.deletedAt)
    const first = list.find(needsReview) ?? list[0]
    if (first) select(first.id)
  }

  const updateCampaign = (id: string, patch: Partial<Campaign>) => setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const createCampaign = () => {
    const id = crypto.randomUUID()
    setCampaigns((cs) => [...cs, { id, name: '', notes: '', attachments: [], voiceId: campaign.voiceId }])
    setCampaignId(id)
    return id
  }

  // A deleted voice falls back to the first one left; restoring it brings it back.
  const voice = aliveVoices.find((v) => v.id === campaign.voiceId) ?? aliveVoices[0]
  const editVoices = () => setProfiles({ kind: 'voice', id: voice.id })

  const setVoice = (voiceId: string) => {
    const cid = campaignId
    const prev = campaign.voiceId
    if (voiceId === prev) return
    const name = voices.find((v) => v.id === voiceId)?.name ?? voiceId
    updateCampaign(cid, { voiceId })
    record(
      `Writing as ${name}`,
      undefined,
      () => updateCampaign(cid, { voiceId: prev }),
      () => updateCampaign(cid, { voiceId }),
      `${campaign.name || 'This campaign'} now writes as ${name}. Regenerate a draft to apply it.`,
    )
  }

  // ---- Soft delete. Everything goes to Deleted items and can be undone. ----
  const setProspectDeleted = (id: string, at?: number) => update(id, (p) => ({ ...p, deletedAt: at }))
  const setCampaignDeleted = (id: string, at?: number) => setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, deletedAt: at } : c)))
  const setVoiceDeleted = (id: string, at?: number) => setVoices((vs) => vs.map((v) => (v.id === id ? { ...v, deletedAt: at } : v)))
  const setNoteDeleted = (voiceId: string, text: string, at?: number) =>
    setVoices((vs) => vs.map((v) => (v.id !== voiceId ? v : { ...v, notes: v.notes.map((n) => (n.text === text ? { ...n, deletedAt: at } : n)) })))
  const setChatDeleted = (pid: string, chatId: string, at?: number) =>
    update(pid, (p) => ({ ...p, chats: p.chats.map((c) => (c.id === chatId ? { ...c, deletedAt: at } : c)) }))
  const setVersionDeleted = (pid: string, versionId: string, at?: number) =>
    update(pid, (p) => ({ ...p, versions: p.versions.map((v) => (v.id === versionId ? { ...v, deletedAt: at } : v)) }))

  // Records a soft delete on the undo stack, with a toast pointing at Deleted items.
  const softDelete = (label: string, set: (at?: number) => void, prospectId?: string, afterUndo?: () => void) => {
    const at = Date.now()
    set(at)
    record(
      `Deleted ${label}`,
      prospectId,
      () => {
        set(undefined)
        afterUndo?.()
      },
      () => set(at),
      `Moved ${label} to Deleted items`,
    )
  }

  const deleteProspect = (id: string) => {
    const p = get(id)
    if (!p) return
    if (id === selectedId) {
      const i = inCampaign.findIndex((x) => x.id === id)
      const rest = inCampaign.filter((x) => x.id !== id)
      const next = rest[Math.min(i, rest.length - 1)]
      if (next) select(next.id)
    }
    softDelete(p.company, (at) => setProspectDeleted(id, at), undefined, () => select(id))
  }

  const deleteCampaign = (id: string) => {
    const c = campaigns.find((x) => x.id === id)
    if (!c || aliveCampaigns.length < 2) return notify({ text: 'You need at least one campaign' })
    const other = aliveCampaigns.find((x) => x.id !== id)!
    if (id === campaign.id) switchCampaign(other.id)
    softDelete(c.name || 'Untitled campaign', (at) => setCampaignDeleted(id, at), undefined, () => switchCampaign(id))
  }

  const deleteVoice = (id: string) => {
    const v = voices.find((x) => x.id === id)
    if (!v || aliveVoices.length < 2) return notify({ text: 'You need at least one voice' })
    if (profiles?.kind === 'voice' && profiles.id === id) setProfiles({ kind: 'voice', id: aliveVoices.find((x) => x.id !== id)!.id })
    softDelete(`the ${v.name} voice`, (at) => setVoiceDeleted(id, at))
  }

  const deleteVoiceNote = (voiceId: string, text: string) => softDelete('a style note', (at) => setNoteDeleted(voiceId, text, at))

  const deleteVersion = (v: Version) => {
    if (!selected) return
    const pid = selected.id
    softDelete(`“${v.label}”`, (at) => setVersionDeleted(pid, v.id, at), pid)
  }

  // ---- Chats: several per email ----
  const selectChat = (chatId: string) => selected && update(selected.id, (p) => ({ ...p, activeChatId: chatId }))

  const newChat = () => {
    if (!selected?.originalBody) return
    const thread: ChatThread = { id: crypto.randomUUID(), title: 'New chat', createdAt: Date.now(), messages: [] }
    update(selected.id, (p) => ({ ...p, chats: [...p.chats, thread], activeChatId: thread.id }))
    setTab('chat')
    setRightOpen(true)
    focusLater('chat-input')
  }

  const deleteChat = (chatId: string) => {
    if (!selected) return
    const pid = selected.id
    const thread = selected.chats.find((c) => c.id === chatId)
    if (!thread) return
    softDelete(`the “${thread.title}” chat`, (at) => setChatDeleted(pid, chatId, at), pid)
  }

  const commitTimers = useRef<Record<string, number>>({})

  // ---- Voice learning: what a save taught Claude about how you write ----
  const applyVoiceChange = (c: VoiceChange, on: boolean) =>
    setVoices((vs) =>
      vs.map((v) => {
        if (v.id !== c.voiceId) return v
        const examples = v.examples ?? []
        if (!on)
          return {
            ...v,
            notes: v.notes.filter((n) => !(n.fresh && c.add.includes(n.text))).map((n) => (n.deletedAt === c.at ? { ...n, deletedAt: undefined } : n)),
            examples: examples.filter((e) => e !== c.example),
          }
        return {
          ...v,
          // Contradicted notes go to Deleted items rather than vanishing.
          notes: [...v.notes.map((n) => (!n.deletedAt && c.remove.includes(n.text) ? { ...n, deletedAt: c.at } : n)), ...c.add.map((text) => ({ text, fresh: true }))],
          examples: [...examples, c.example].slice(-MAX_VOICE_EXAMPLES),
        }
      }),
    )

  // Compares Claude's draft with what you saved. The pair itself is kept as an
  // example even if extracting notes fails.
  const learnVoice = async (p: Prospect): Promise<VoiceChange> => {
    const v = voiceOf(p.campaignId)
    const example = { draft: htmlToText(p.originalBody), final: htmlToText(p.body) }
    const base: VoiceChange = { voiceId: v.id, at: Date.now(), add: [], remove: [], example }
    if (!window.api) return base
    const res = await window.api.claude.learnVoice({ voiceName: v.name, notes: voiceInput(v).notes, ...example })
    return res.ok ? { ...base, ...res.value } : base
  }

  const mailReady = !window.api || (!!settings?.mail && settings.hasMailPassword)

  const save = () => {
    if (!selected?.originalBody) return
    if (!mailReady)
      return notify({ text: 'Connect your mailbox to save drafts', action: { label: 'Open settings', run: () => setSettingsOpen(true) } })
    const { id: pid, status: prev, company, draftRef: prevRef } = selected
    const edited = selected.body !== selected.originalBody
    const versionId = crypto.randomUUID()
    // This save's trip to the mailbox, so undo knows whether to cancel it or delete the draft.
    const sync: { committed: boolean; ref?: DraftRef } = { committed: false }
    // Voice learning runs alongside; undo rolls it back, redo re-applies it.
    const learn: { started: boolean; active: boolean; change?: VoiceChange } = { started: false, active: false }
    const snapshot = selected

    const commit = async () => {
      sync.committed = true
      const p = get(pid)
      if (!p || !window.api) return
      const res = await window.api.mail.saveDraft({ to: p.to, subject: p.subject, html: p.body, text: htmlToText(p.body) })
      if (!res.ok) {
        update(pid, (q) => ({ ...q, status: prev === 'saved' ? 'edited' : prev, versions: q.versions.filter((v) => v.id !== versionId) }))
        return notify({ text: `Couldn’t save ${company} to Drafts: ${res.error}`, action: { label: 'Open settings', run: () => setSettingsOpen(true) } })
      }
      sync.ref = res.value
      update(pid, (q) => ({ ...q, draftRef: res.value }))
      // Saving again replaces the earlier draft rather than leaving a duplicate behind.
      if (prevRef) void window.api.mail.deleteDraft(prevRef)
    }

    const apply = () => {
      update(pid, (p) => ({
        ...p,
        status: 'saved',
        versions: [...p.versions, { id: versionId, label: 'Saved to Drafts', by: 'you', at: Date.now(), html: p.body }],
      }))
      // Held back briefly so undo can cancel it before anything reaches the mailbox.
      sync.committed = false
      clearTimeout(commitTimers.current[pid])
      commitTimers.current[pid] = window.setTimeout(commit, UNDO_GRACE_MS)
      if (!edited) return
      learn.active = true
      if (learn.change) return applyVoiceChange(learn.change, true)
      if (learn.started) return
      learn.started = true
      void learnVoice(snapshot).then((change) => {
        learn.change = change
        if (!learn.active) return
        applyVoiceChange(change, true)
        const v = voicesRef.current.find((x) => x.id === change.voiceId)
        const n = change.add.length + change.remove.length
        if (n && v)
          notify({
            text: `Updated ${v.name}: ${[change.add.length && `${change.add.length} new note${change.add.length > 1 ? 's' : ''}`, change.remove.length && `${change.remove.length} removed`].filter(Boolean).join(', ')}`,
            action: { label: 'View', run: () => setProfiles({ kind: 'voice', id: v.id }) },
          })
      })
    }
    apply()
    const next = nextReviewId(pid)
    if (next) select(next)
    const nextName = next && get(next)?.company
    record(
      'Saved to Drafts',
      pid,
      () => {
        update(pid, (p) => ({ ...p, status: prev, draftRef: prevRef, versions: p.versions.filter((v) => v.id !== versionId) }))
        learn.active = false
        if (learn.change) applyVoiceChange(learn.change, false)
        if (!sync.committed) {
          clearTimeout(commitTimers.current[pid])
          return `Cancelled saving ${company}. Nothing reached your mailbox.`
        }
        if (sync.ref && window.api)
          void window.api.mail.deleteDraft(sync.ref).then((r) => !r.ok && notify({ text: `Couldn’t remove the draft from your mailbox: ${r.error}` }))
        return `Deleted ${company}'s draft from your mailbox${learn.change ? ' and rolled back the voice update' : ''}`
      },
      apply,
      `Saved ${company} to Drafts${nextName ? ` · now on ${nextName}` : ''}`,
    )
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const regenerate = async () => {
    if (!selected?.originalBody || regeneratingId || !window.api) return
    const p = selected
    const pid = p.id
    // Drafts made before research notes were kept fall back to the brief.
    const research = p.research ?? (p.brief ? JSON.stringify(p.brief) : '')
    if (!research) return notify({ text: 'Nothing to redraft from yet. Retry the research first.' })
    setRegeneratingId(pid)
    const res = await window.api.claude.draft({ ...claudeContext(p), research, previousDraft: `Subject: ${p.subject}\n\n${htmlToText(p.body)}` })
    setRegeneratingId(null)
    if (!res.ok) return notify({ text: `Couldn’t regenerate: ${res.error}` })
    const q = get(pid)
    if (!q) return
    const html = textToHtml(res.value.body)
    const subject = res.value.subject
    const before = { body: q.body, originalBody: q.originalBody, subject: q.subject, status: q.status }
    // Keep your edits in history so regenerating never loses work.
    const added: Version[] = [
      ...(q.versions.some((v) => v.html === q.body) ? [] : [{ id: crypto.randomUUID(), label: 'Your edits', by: 'you' as const, at: Date.now(), html: q.body }]),
      { id: crypto.randomUUID(), label: 'Regenerated draft', by: 'claude', at: Date.now(), html },
    ]
    const apply = () =>
      update(pid, (x) => ({
        ...x,
        body: html,
        originalBody: html,
        subject,
        status: x.status === 'saved' ? 'saved' : 'drafted',
        versions: [...x.versions.filter((v) => !added.some((a) => a.id === v.id)), ...added],
      }))
    apply()
    record(
      'Regenerated draft',
      pid,
      () => {
        update(pid, (x) => ({ ...x, ...before }))
        return 'Back to your previous version. The regenerated one is still in History.'
      },
      apply,
      `Regenerated ${q.company} · your previous version is in History`,
    )
  }

  const restoreVersion = (v: Version) => {
    if (!selected) return
    const { id: pid, body: prevBody } = selected
    const setBody = (body: string) => update(pid, (p) => ({ ...p, body, status: statusAfter(p, body) }))
    if (!selected.versions.some((x) => x.html === prevBody))
      update(pid, (p) => ({ ...p, versions: [...p.versions, { id: crypto.randomUUID(), label: 'Your edits', by: 'you', at: Date.now(), html: prevBody }] }))
    setBody(v.html)
    record(
      `Restored “${v.label}”`,
      pid,
      () => setBody(prevBody),
      () => setBody(v.html),
    )
  }

  const findProposal = (p: Prospect, msgId: string, propId: string) =>
    p.chats.flatMap((c) => c.messages).find((m) => m.id === msgId)?.proposals?.find((x) => x.id === propId)

  const setProposalState = (pid: string, msgId: string, propId: string, state: 'pending' | 'accepted' | 'rejected') =>
    update(pid, (p) => ({
      ...p,
      chats: p.chats.map((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id !== msgId ? m : { ...m, proposals: m.proposals?.map((x) => (x.id === propId ? { ...x, state } : x)) })),
      })),
    }))

  // Suggestions quote plain text from either the subject or the body.
  const swapText = (pid: string, from: string, to: string) =>
    update(pid, (p) => {
      if (p.subject.includes(from)) return { ...p, subject: p.subject.replace(from, () => to) }
      const body = replaceText(p.body, from, to)
      return { ...p, body, status: statusAfter(p, body) }
    })

  const resolveProposal = (msgId: string, propId: string, accept: boolean) => {
    if (!selected) return
    const pid = selected.id
    const prop = findProposal(selected, msgId, propId)
    if (!prop) return
    if (accept && !hasText(selected, prop.old)) return notify({ text: "Couldn't apply: that text has changed since Claude suggested it" })
    const apply = () => {
      if (accept) swapText(pid, prop.old, prop.new)
      setProposalState(pid, msgId, propId, accept ? 'accepted' : 'rejected')
    }
    apply()
    record(
      accept ? 'Accepted suggestion' : 'Rejected suggestion',
      pid,
      () => {
        setProposalState(pid, msgId, propId, 'pending')
        if (!accept) return
        // Swap just that text back, so anything typed since survives.
        if (!hasText(get(pid), prop.new)) return 'Suggestion is back, but you’ve edited that text since, so the email was left as is'
        swapText(pid, prop.new, prop.old)
      },
      apply,
    )
  }

  const resolveNextProposal = (accept: boolean) => {
    if (!selected) return
    for (const m of activeChat(selected)?.messages ?? [])
      for (const pr of m.proposals ?? [])
        if (pr.state === 'pending') {
          setTab('chat')
          return resolveProposal(m.id, pr.id, accept)
        }
  }

  const setRecipients = (to: string[]) => {
    if (!selected) return
    const { id: pid, to: prev } = selected
    const added = to.filter((x) => !prev.includes(x))
    const removed = prev.filter((x) => !to.includes(x))
    const label = added.length ? `Added ${added.join(', ')}` : `Removed ${removed.join(', ')}`
    update(pid, (p) => ({ ...p, to }))
    record(
      label,
      pid,
      () => update(pid, (p) => ({ ...p, to: prev })),
      () => update(pid, (p) => ({ ...p, to })),
    )
  }

  const addRecipient = (email: string) => selected && !selected.to.includes(email) && setRecipients([...selected.to, email])

  const addTopRecipient = () => {
    if (!selected) return
    const r = selected.brief?.recipients.find((r) => r.email && !selected.to.includes(r.email))
    if (r) addRecipient(r.email)
  }

  const editBody = () => {
    if (!selected?.originalBody) return
    setShowDiff(false)
    focusLater('email-body')
  }

  const openChat = () => {
    setTab('chat')
    setRightOpen(true)
    focusLater('chat-input')
  }

  // Header BRIEF / CHAT buttons and ⌘⇧B: open that tab, or close if it's already showing.
  const togglePanel = (t: Tab) => {
    if (rightOpen && tab === t) return setRightOpen(false)
    setTab(t)
    setRightOpen(true)
  }

  const revertProposal = (msgId: string, propId: string) => {
    if (!selected) return
    const pid = selected.id
    const prop = findProposal(selected, msgId, propId)
    if (!prop || prop.state === 'pending') return
    const prev = prop.state
    if (prev === 'accepted' && !hasText(selected, prop.new)) return notify({ text: 'Can’t undo that one: you’ve edited that text since' })
    const apply = () => {
      if (prev === 'accepted') swapText(pid, prop.new, prop.old)
      setProposalState(pid, msgId, propId, 'pending')
    }
    apply()
    record(
      prev === 'accepted' ? 'Undid suggestion' : 'Brought suggestion back',
      pid,
      () => {
        if (prev === 'accepted') swapText(pid, prop.old, prop.new)
        setProposalState(pid, msgId, propId, prev)
      },
      apply,
    )
  }

  const toggleChatFocus = () => {
    if (document.activeElement?.id === 'chat-input' && selected?.originalBody) editBody()
    else openChat()
  }

  // Tracks whether a text box has focus, so the UI can say which keys apply.
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const sync = () => {
      const el = document.activeElement as HTMLElement | null
      setTyping(!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
    }
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', () => setTimeout(sync))
    return () => document.removeEventListener('focusin', sync)
  }, [])

  const goToNextReview = () => {
    const next = nextReviewId(selectedId)
    if (next) select(next)
  }

  // Re-bound every render so the handler always sees current state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable

      // ⌘K is the palette everywhere, so any action is reachable mid-typing.
      // Exception: with text selected in the email it makes a link (handled by the editor).
      const linking = !!el.closest?.('#email-body') && !window.getSelection()?.isCollapsed
      if (mod && e.key.toLowerCase() === 'k' && !linking) {
        e.preventDefault()
        setPalette((v) => !v)
        return
      }
      // Dialogs and sheets handle their own Escape; don't act behind them.
      if (overlayOpen) return
      if (e.key === 'Escape' && typing) return el.blur()

      if (mod && e.key.toLowerCase() === 'z') {
        if (el.closest?.('#email-body')) return // the editor asks undoBridge itself
        if (typing && dirtyInput.current === el) return // native undo for what you just typed here
        e.preventDefault()
        return e.shiftKey ? appRedo() : appUndo()
      }

      // Modifier shortcuts work everywhere, including mid-typing, since most of
      // the time focus is in the email or the chat box.
      if (mod) {
        const key = e.key.toLowerCase()
        const run = (fn: () => void) => {
          e.preventDefault()
          fn()
        }
        if (key === ',') return run(() => setSettingsOpen(true))
        if (key === 'enter') return run(e.shiftKey ? () => resolveNextProposal(true) : save)
        if (key === 'backspace' && e.shiftKey) return run(() => resolveNextProposal(false))
        if (key === '/') return run(toggleChatFocus)
        if (key === 'b' && e.shiftKey) return run(() => togglePanel('brief'))
        // ⌘\\ (left sidebar) is handled by shadcn's SidebarProvider.
        if ((key === '\\' || key === '|') && e.shiftKey) return run(() => setRightOpen((v) => !v))
        if (key === ']') return run(() => step(1))
        if (key === '[') return run(() => step(-1))
        if (key === 'd' && !e.shiftKey) return run(() => setShowDiff((v) => !v))
        if (key === 'r' && !e.shiftKey) return run(regenerate)
      }
      if (typing || mod || e.altKey) return

      const actions: Record<string, () => void> = {
        j: () => step(1),
        ArrowDown: () => step(1),
        k: () => step(-1),
        ArrowUp: () => step(-1),
        n: goToNextReview,
        '1': () => setFilter('all'),
        '2': () => setFilter('review'),
        '3': () => setFilter('saved'),
        e: editBody,
        Enter: editBody,
        t: addTopRecipient,
        b: () => togglePanel('brief'),
        '/': openChat,
        a: () => resolveNextProposal(true),
        x: () => resolveNextProposal(false),
        c: () => setAdding(true),
        Backspace: () => view === 'email' && selected && deleteProspect(selected.id),
        Delete: () => view === 'email' && selected && deleteProspect(selected.id),
        '?': () => setHelp(true),
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- Deleted items ----
  type TrashEntry = TrashItem & { set: (at?: number) => void; purge: () => void }
  const campaignName = (id: string) => campaigns.find((c) => c.id === id)?.name || 'Untitled campaign'
  const trash: TrashEntry[] = [
    ...campaigns
      .filter((c) => c.deletedAt)
      .map<TrashEntry>((c) => ({
        key: `campaign:${c.id}`,
        kind: 'campaign',
        label: c.name || 'Untitled campaign',
        context: `${prospects.filter((p) => p.campaignId === c.id && !p.deletedAt).length} organisations`,
        deletedAt: c.deletedAt!,
        set: (at) => setCampaignDeleted(c.id, at),
        purge: () => {
          setCampaigns((cs) => cs.filter((x) => x.id !== c.id))
          setProspects((ps) => ps.filter((p) => p.campaignId !== c.id))
        },
      })),
    ...prospects
      .filter((p) => p.deletedAt)
      .map<TrashEntry>((p) => ({
        key: `org:${p.id}`,
        kind: 'organisation',
        label: p.company,
        context: campaignName(p.campaignId),
        deletedAt: p.deletedAt!,
        set: (at) => {
          setProspectDeleted(p.id, at)
          // Restoring an organisation from a deleted campaign brings the campaign back too.
          if (at === undefined) setCampaignDeleted(p.campaignId, undefined)
        },
        purge: () => setProspects((ps) => ps.filter((x) => x.id !== p.id)),
      })),
    ...voices
      .filter((v) => v.deletedAt)
      .map<TrashEntry>((v) => ({
        key: `voice:${v.id}`,
        kind: 'voice',
        label: v.name,
        context: v.description,
        deletedAt: v.deletedAt!,
        set: (at) => setVoiceDeleted(v.id, at),
        purge: () => setVoices((vs) => vs.filter((x) => x.id !== v.id)),
      })),
    ...voices.flatMap((v) =>
      v.notes
        .filter((n) => n.deletedAt)
        .map<TrashEntry>((n) => ({
          key: `note:${v.id}:${n.text}`,
          kind: 'note',
          label: n.text,
          context: `${v.name} voice`,
          deletedAt: n.deletedAt!,
          set: (at) => setNoteDeleted(v.id, n.text, at),
          purge: () => setVoices((vs) => vs.map((x) => (x.id !== v.id ? x : { ...x, notes: x.notes.filter((y) => y.text !== n.text) }))),
        })),
    ),
    ...prospects.flatMap((p) =>
      p.chats
        .filter((c) => c.deletedAt)
        .map<TrashEntry>((c) => ({
          key: `chat:${p.id}:${c.id}`,
          kind: 'chat',
          label: c.title,
          context: `${p.company} · ${c.messages.length} messages`,
          deletedAt: c.deletedAt!,
          set: (at) => setChatDeleted(p.id, c.id, at),
          purge: () => update(p.id, (q) => ({ ...q, chats: q.chats.filter((x) => x.id !== c.id) })),
        })),
    ),
    ...prospects.flatMap((p) =>
      p.versions
        .filter((v) => v.deletedAt)
        .map<TrashEntry>((v) => ({
          key: `version:${p.id}:${v.id}`,
          kind: 'version',
          label: v.label,
          context: p.company,
          deletedAt: v.deletedAt!,
          set: (at) => setVersionDeleted(p.id, v.id, at),
          purge: () => update(p.id, (q) => ({ ...q, versions: q.versions.filter((x) => x.id !== v.id) })),
        })),
    ),
  ]
  const trashEntry = (item: TrashItem) => trash.find((t) => t.key === item.key)

  const restoreItem = (item: TrashItem) => {
    const entry = trashEntry(item)
    if (!entry) return
    entry.set(undefined)
    record(`Restored ${item.label}`, undefined, () => entry.set(item.deletedAt), () => entry.set(undefined))
  }

  // Permanent: not on the undo stack, which is why the UI confirms first.
  const purgeItem = (item: TrashItem) => {
    trashEntry(item)?.purge()
    notify({ text: `Permanently deleted ${item.label}` })
  }

  const emptyTrash = () => {
    trash.forEach((t) => t.purge())
    notify({ text: `Permanently deleted ${trash.length} item${trash.length === 1 ? '' : 's'}` })
  }

  const undoTop = undoStack.current.at(-1)
  const redoTop = redoStack.current.at(-1)
  const commands: PaletteCommand[] = [
    ...inCampaign.map<PaletteCommand>((p) => ({
      id: `go-${p.id}`,
      group: 'Organisations',
      label: p.company,
      icon: <span className="grid size-4 place-items-center rounded-sm bg-muted text-[10px] font-semibold">{p.company[0]}</span>,
      hint: statusStyle[p.status].label,
      run: () => select(p.id),
    })),
    ...(undoTop ? [{ id: 'undo', group: 'Actions' as const, label: `Undo: ${undoTop.label}`, icon: <Undo2 />, shortcut: '⌘Z', run: appUndo }] : []),
    ...(redoTop ? [{ id: 'redo', group: 'Actions' as const, label: `Redo: ${redoTop.label}`, icon: <Redo2 />, shortcut: '⌘⇧Z', run: appRedo }] : []),
    { id: 'save', group: 'Actions', label: 'Save to drafts', icon: <Inbox />, shortcut: '⌘↵', run: save },
    { id: 'diff', group: 'Actions', label: 'Compare with Claude’s draft', icon: <GitCompare />, shortcut: '⌘D', run: () => setShowDiff((v) => !v) },
    { id: 'regen', group: 'Actions', label: 'Regenerate draft', icon: <RefreshCw />, shortcut: '⌘R', run: regenerate },
    { id: 'chat', group: 'Actions', label: 'Chat with Claude', icon: <MessageSquare />, shortcut: '⌘/', run: openChat },
    { id: 'brief', group: 'Actions', label: 'Show brief', icon: <FileText />, shortcut: '⌘⇧B', run: () => togglePanel('brief') },
    { id: 'left', group: 'Actions', label: 'Toggle sidebar', icon: <PanelLeft />, shortcut: '⌘\\', run: () => setLeftOpen((v) => !v) },
    {
      id: 'right',
      group: 'Actions',
      label: rightOpen ? 'Hide brief & chat' : 'Show brief & chat',
      icon: <PanelRight />,
      shortcut: '⌘⇧\\',
      run: () => setRightOpen((v) => !v),
    },
    { id: 'add', group: 'Actions', label: 'Add to campaign', icon: <Plus />, shortcut: 'C', run: () => setAdding(true) },
    {
      id: 'theme',
      group: 'Actions',
      label: theme === 'dark' ? 'Light mode' : 'Dark mode',
      icon: theme === 'dark' ? <Sun /> : <Moon />,
      run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    },
    { id: 'help', group: 'Actions', label: 'Keyboard shortcuts', icon: <Keyboard />, shortcut: '?', run: () => setHelp(true) },
    { id: 'settings', group: 'Actions', label: 'Settings', icon: <Settings />, shortcut: '⌘,', run: () => setSettingsOpen(true) },
    { id: 'new-chat', group: 'Actions', label: 'New chat', icon: <MessageSquarePlus />, run: newChat },
    ...(selected && activeChat(selected)
      ? [{ id: 'delete-chat', group: 'Actions' as const, label: `Delete chat “${activeChat(selected)!.title}”`, icon: <Trash2 />, run: () => deleteChat(activeChat(selected)!.id) }]
      : []),
    ...(selected ? [{ id: 'delete-org', group: 'Actions' as const, label: `Delete ${selected.company}`, icon: <Trash2 />, shortcut: '⌫', run: () => deleteProspect(selected.id) }] : []),
    { id: 'trash', group: 'Actions', label: `Deleted items${trash.length ? ` (${trash.length})` : ''}`, icon: <Trash2 />, run: () => setView('trash') },
    ...aliveVoices
      .filter((v) => v.id !== voice.id)
      .map<PaletteCommand>((v) => ({
        id: `voice-${v.id}`,
        group: 'Campaigns & voices',
        label: `Write as ${v.name}`,
        icon: <PenLine />,
        run: () => setVoice(v.id),
      })),
    { id: 'voices', group: 'Campaigns & voices', label: 'Edit voices', icon: <PenLine />, run: editVoices },
    ...aliveCampaigns
      .filter((c) => c.id !== campaign.id)
      .map<PaletteCommand>((c) => ({
        id: `campaign-${c.id}`,
        group: 'Campaigns & voices',
        label: `Switch to ${c.name || 'Untitled campaign'}`,
        icon: <Flag />,
        run: () => switchCampaign(c.id),
      })),
    { id: 'campaign', group: 'Campaigns & voices', label: 'Edit campaign notes', icon: <Flag />, run: () => setProfiles({ kind: 'campaign', id: campaignId }) },
    {
      id: 'new-campaign',
      group: 'Campaigns & voices',
      label: 'New campaign',
      icon: <Plus />,
      run: () => setProfiles({ kind: 'campaign', id: createCampaign() }),
    },
  ]

  const queuePosition = prospects.filter((p) => p.status === 'queued').findIndex((p) => p.id === selectedId)

  const addProspects = (orgs: { company: string; website: string }[]) => {
    const added = orgs.map<Prospect>(({ company, website }) => ({
      id: crypto.randomUUID(),
      campaignId,
      company,
      domain: website,
      status: 'queued',
      progress: [],
      subject: '',
      originalBody: '',
      body: '',
      to: [],
      chats: [],
      versions: [],
    }))
    const ids = added.map((p) => p.id)
    const apply = () => setProspects((ps) => [...ps.filter((p) => !ids.includes(p.id)), ...added])
    apply()
    record(`Added ${added.length} to ${campaign.name}`, undefined, () => setProspects((ps) => ps.filter((p) => !ids.includes(p.id))), apply)
    setAdding(false)
  }

  // A suggestion as Claude will see it in the transcript of earlier turns.
  const describe = (m: ChatMsg) =>
    [m.text, ...(m.proposals ?? []).map((x) => `[Suggested replacing “${x.old}” with “${x.new}” — ${x.state === 'pending' ? 'not yet decided' : x.state}]`)].join('\n')

  const sendChat = async (text: string) => {
    if (!selected) return
    const p = selected
    const pid = p.id
    const current = activeChat(p)
    if (current?.messages.some((m) => m.pending)) return
    // No chat yet: start one, named after the first message.
    const thread: ChatThread = current ?? { id: crypto.randomUUID(), title: text.slice(0, 40), createdAt: Date.now(), messages: [] }
    const chatId = thread.id
    const title = thread.messages.length ? thread.title : text.slice(0, 40)
    const history = thread.messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: describe(m) }))
    const replyId = crypto.randomUUID()
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', text }
    const reply: ChatMsg = { id: replyId, role: 'assistant', text: '', pending: true }
    update(pid, (q) => ({
      ...q,
      activeChatId: chatId,
      chats: q.chats.some((c) => c.id === chatId)
        ? q.chats.map((c) => (c.id === chatId ? { ...c, title: c.messages.length ? c.title : title, messages: [...c.messages, userMsg, reply] } : c))
        : [...q.chats, { ...thread, title, messages: [userMsg, reply] }],
    }))
    const setReply = (fn: (m: ChatMsg) => ChatMsg) =>
      update(pid, (q) => ({
        ...q,
        chats: q.chats.map((c) => (c.id !== chatId ? c : { ...c, messages: c.messages.map((m) => (m.id === replyId ? fn(m) : m)) })),
      }))
    if (!window.api) return setReply((m) => ({ ...m, pending: false, error: true, text: 'Chat runs in the Inroad desktop app.' }))

    const jobId = crypto.randomUUID()
    jobs.current.set(jobId, (e) => e.kind === 'delta' && setReply((m) => ({ ...m, text: m.text + e.text })))
    const res = await window.api.claude.chat({
      jobId,
      ...claudeContext(p),
      brief: p.brief,
      subject: p.subject,
      body: htmlToText(p.body),
      history,
      message: text,
    })
    jobs.current.delete(jobId)
    if (!res.ok) return setReply((m) => ({ ...m, pending: false, error: true, text: res.error }))
    setReply((m) => ({
      ...m,
      pending: false,
      text: res.value.text,
      proposals: res.value.proposals.map((x) => ({ ...x, id: crypto.randomUUID(), state: 'pending' })),
    }))
  }

  const panel = selected && (
    <RightPanel
      prospect={selected}
      tab={tab}
      onTab={setTab}
      onClose={() => setRightOpen(false)}
      onAddRecipient={addRecipient}
      onProposal={resolveProposal}
      onRevertProposal={revertProposal}
      onSend={sendChat}
      onNewChat={newChat}
      onSelectChat={selectChat}
      onDeleteChat={deleteChat}
    />
  )

  const main = view === 'trash' ? (
    <TrashView items={trash} onRestore={restoreItem} onPurge={purgeItem} onEmpty={emptyTrash} />
  ) : selected ? (
    <Editor
      prospect={selected}
      from={settings?.mail?.fromEmail ? `${settings.mail.fromName ? `${settings.mail.fromName} ` : ''}<${settings.mail.fromEmail}>` : ''}
      voiceName={voice.name}
      attachments={campaign.attachments}
      queuePosition={queuePosition}
      showDiff={showDiff}
      onToggleDiff={() => setShowDiff((v) => !v)}
      regenerating={regeneratingId === selected.id}
      onRegenerate={regenerate}
      onRestoreVersion={restoreVersion}
      onDeleteVersion={deleteVersion}
      onChange={(patch) => (patch.to ? setRecipients(patch.to) : update(selected.id, (p) => ({ ...p, ...patch })))}
      onRetry={(website) => update(selected.id, (p) => ({ ...p, status: 'queued', progress: [], error: undefined, domain: website || p.domain }))}
      onSave={save}
      panelTab={rightOpen ? tab : null}
      showPanelButtons={!(rightDocks && rightOpen)}
      pendingSuggestions={(activeChat(selected)?.messages ?? []).flatMap((m) => m.proposals ?? []).filter((x) => x.state === 'pending').length}
      onPanel={togglePanel}
    />
  ) : (
    <div className="flex h-full flex-col items-start justify-center gap-3 px-10">
      <h2 className="font-heading text-2xl font-semibold">Nothing in {campaign.name || 'this campaign'} yet</h2>
      <p className="max-w-md text-muted-foreground">
        {campaign.notes.trim()
          ? 'Add the organisations you want to reach. Claude researches each one and drafts an email.'
          : 'Start with the campaign notes: what you’re asking for, the details Claude should mention, and what to look for when researching. Then add the organisations you want to reach.'}
      </p>
      <div className="flex gap-2">
        {!campaign.notes.trim() && (
          <Button onClick={() => setProfiles({ kind: 'campaign', id: campaign.id })}>
            <Flag /> Write campaign notes
          </Button>
        )}
        <Button variant={campaign.notes.trim() ? 'default' : 'outline'} onClick={() => setAdding(true)}>
          <Plus /> Add to campaign
        </Button>
      </div>
    </div>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider open={leftOpen} onOpenChange={setLeftOpen} className="h-svh min-h-0 overflow-hidden">
        <AppSidebar
          prospects={inCampaign}
          allProspects={prospects}
          campaigns={aliveCampaigns}
          campaignId={campaign.id}
          voices={aliveVoices}
          onDeleteProspect={deleteProspect}
          onDeleteCampaign={deleteCampaign}
          trashCount={trash.length}
          viewingTrash={view === 'trash'}
          onOpenTrash={() => setView((v) => (v === 'trash' ? 'email' : 'trash'))}
          mailAddress={!window.api ? 'jordan@harbourhackers.example' : settings?.mail && settings.hasMailPassword ? settings.mail.fromEmail : undefined}
          onOpenSettings={() => setSettingsOpen(true)}
          onSwitchCampaign={switchCampaign}
          onEditCampaign={(id) => setProfiles({ kind: 'campaign', id })}
          onNewCampaign={() => setProfiles({ kind: 'campaign', id: createCampaign() })}
          onSetVoice={setVoice}
          onEditVoices={editVoices}
          selectedId={selectedId}
          onSelect={select}
          onAdd={() => setAdding(true)}
          filter={filter}
          onFilter={setFilter}
          typing={typing}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onOpenPalette={() => setPalette(true)}
          onShowKeys={() => setHelp(true)}
        />
        <SidebarInset className="min-w-0 overflow-hidden">
          {rightDocks && selected && view === 'email' ? (
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-full"
              // Fires on every drag step (unlike Panel.onResize, which waits for a
              // ResizeObserver), so the panel's content appears as soon as it opens.
              onLayoutChange={(layout) => {
                const open = (layout.panel ?? 0) > 0.5
                if (open !== rightOpen) setRightOpen(open)
              }}
            >
              <ResizablePanel id="main" minSize={420}>
                {main}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="panel" panelRef={rightPanelRef} collapsible collapsedSize={0} defaultSize={rightOpen ? 380 : 0} minSize={300} maxSize={640}>
                {rightOpen && panel}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            main
          )}
        </SidebarInset>

        {!rightDocks && (
          <Sheet open={rightOpen && !!selected && view === 'email'} onOpenChange={setRightOpen}>
            <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md">
              <SheetHeader className="sr-only">
                <SheetTitle>Brief & chat</SheetTitle>
                <SheetDescription>Research brief and chat with Claude for this email</SheetDescription>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        )}
      </SidebarProvider>

      <AddCompaniesDialog open={adding} onOpenChange={setAdding} campaign={campaign} voiceName={voice.name} onAdd={addProspects} />
      <ProfilesDialog
        target={profiles}
        onTarget={setProfiles}
        campaigns={aliveCampaigns}
        voices={aliveVoices}
        onUpdateCampaign={updateCampaign}
        onCreateCampaign={createCampaign}
        onDeleteCampaign={deleteCampaign}
        onDeleteVoice={deleteVoice}
        onDeleteVoiceNote={deleteVoiceNote}
      />
      <CommandPalette open={palette} onOpenChange={setPalette} commands={commands} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSaved={setSettings} />
      <Toaster theme={theme} position="bottom-center" />
    </TooltipProvider>
  )
}
