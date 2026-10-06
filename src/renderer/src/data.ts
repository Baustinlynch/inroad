import type { Attachment, Brief, DraftRef, Recipient } from '../../shared/api'

export type { Attachment, Brief, Recipient }

export type Status = 'queued' | 'researching' | 'drafted' | 'edited' | 'saved' | 'failed'

export interface Proposal {
  id: string
  old: string
  new: string
  reason: string
  state: 'pending' | 'accepted' | 'rejected'
}

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposals?: Proposal[]
  // Claude is still writing this reply.
  pending?: boolean
  // The reply failed; text holds the reason.
  error?: boolean
}

export interface Version {
  id: string
  label: string
  by: 'claude' | 'you'
  at: number
  html: string
  deletedAt?: number
}

// One conversation with Claude about an email. An email can have several.
export interface ChatThread {
  id: string
  title: string
  createdAt: number
  messages: ChatMsg[]
  deletedAt?: number
}

export interface Prospect {
  id: string
  campaignId: string
  company: string
  // Website, if given or found. Helps research find the right organisation.
  domain: string
  status: Status
  progress: string[]
  error?: string
  brief?: Brief
  // Claude's research notes with sources, so redrafting doesn't search again.
  research?: string
  subject: string
  originalBody: string
  body: string
  to: string[]
  chats: ChatThread[]
  activeChatId?: string
  // Every draft Claude wrote, your edits before a regenerate, and each save.
  versions: Version[]
  // Soft delete: set when moved to Deleted items, cleared on restore.
  deletedAt?: number
  // The copy in the mailbox's Drafts folder, once saved there.
  draftRef?: DraftRef
}

export interface Campaign {
  id: string
  name: string
  // Freeform: what you're asking for, context, what to research, tone. Fed to
  // both the research agent and the drafting prompt for every email.
  notes: string
  // Added to every email in this campaign when it's saved to Drafts.
  attachments: Attachment[]
  // Which voice profile drafts in this campaign are written in.
  voiceId: string
  deletedAt?: number
}

export interface Voice {
  id: string
  name: string
  description: string
  notes: { text: string; fresh: boolean; deletedAt?: number }[]
  // Shown to Claude as examples of how you actually write (oldest first).
  examples?: VoiceExample[]
  deletedAt?: number
}

export interface VoiceExample {
  id: string
  at: number
  // Claude's draft, when this came from saving an edited email. Pasted
  // emails have none.
  draft?: string
  final: string
  deletedAt?: number
}

// How many saved edits Claude sees as examples (the newest). Pasted emails are always included.
export const MAX_VOICE_EXAMPLES = 4

export const firstRunCampaign = (voiceId: string): Campaign => ({ id: crypto.randomUUID(), name: 'Sponsors', notes: '', attachments: [], voiceId })

export const firstRunVoice = (): Voice => ({
  id: crypto.randomUUID(),
  name: 'My voice',
  description: 'Learns from the edits you make before saving',
  notes: [],
})
