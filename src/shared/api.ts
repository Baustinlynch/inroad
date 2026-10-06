// The surface the preload script exposes to the renderer as `window.api`.
// Kept small and explicit: the renderer never gets raw ipcRenderer access.

// ---- Research brief (written by Claude, shown in the Brief panel) ----
export interface Recipient {
  name: string
  role: string
  // Empty when no address was found.
  email: string
  confidence: 'high' | 'medium' | 'low'
  source: string
}

export interface Brief {
  summary: string
  // Headings are chosen to suit the campaign, e.g. "Past sponsorships" for
  // sponsors, "Capacity & facilities" for venues.
  sections: { title: string; items: string[] }[]
  recipients: Recipient[]
  sources: { title: string; url: string }[]
}

// ---- Claude requests ----
export interface VoiceInput {
  name: string
  notes: string[]
  // Recent emails as Claude drafted them vs. as the user saved them.
  examples: { draft: string; final: string }[]
}

export interface ResearchRequest {
  jobId: string
  company: string
  website?: string
  campaignNotes: string
  voice: VoiceInput
  senderName: string
}

export interface ResearchResult {
  // Free-form findings with source URLs; kept so redrafting doesn't re-search.
  research: string
  draft: DraftResult
}

export interface DraftRequest {
  company: string
  campaignNotes: string
  research: string
  voice: VoiceInput
  senderName: string
  // When regenerating: the draft to move away from.
  previousDraft?: string
}

export interface DraftResult {
  brief: Brief
  // The recipient Claude thinks is best, or '' if none has an address.
  to: string
  subject: string
  // Lightweight markdown: blank-line paragraphs, **bold**, [text](url).
  body: string
}

export interface ChatRequest {
  jobId: string
  company: string
  campaignNotes: string
  brief?: Brief
  voice: VoiceInput
  subject: string
  // The email as plain text; suggested edits quote from this.
  body: string
  history: { role: 'user' | 'assistant'; text: string }[]
  message: string
}

export interface ProposedEdit {
  old: string
  new: string
  reason: string
}

export interface ChatResult {
  text: string
  proposals: ProposedEdit[]
}

export interface VoiceLearnRequest {
  voiceName: string
  notes: string[]
  draft: string
  final: string
}

export interface VoiceLearnResult {
  add: string[]
  // Existing notes the edits contradict, quoted exactly.
  remove: string[]
}

// Streamed while a request runs: research steps, or chat text as it arrives.
export type ClaudeProgress = { jobId: string; kind: 'step'; text: string } | { jobId: string; kind: 'delta'; text: string }

export interface MailSettings {
  host: string
  port: number
  // true = implicit TLS (usually port 993); false = STARTTLS.
  secure: boolean
  user: string
  fromName: string
  fromEmail: string
}

// What the renderer sees: secrets are never sent back, only whether they're set.
export interface PublicSettings {
  mail: MailSettings | null
  hasMailPassword: boolean
  // Optional: without one, Claude runs on this computer's Claude Code sign-in.
  hasAnthropicKey: boolean
}

export interface SettingsPatch {
  mail?: MailSettings
  mailPassword?: string
  anthropicKey?: string
}

export interface DraftInput {
  to: string[]
  subject: string
  html: string
  text: string
}

// Enough to find the draft again (to replace or delete it).
export interface DraftRef {
  mailbox: string
  messageId: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface InroadApi {
  // process.platform, e.g. 'darwin'.
  platform: string
  store: {
    // Returns the saved app state, or null on first run.
    load: () => Promise<unknown | null>
    save: (data: unknown) => Promise<void>
  }
  settings: {
    get: () => Promise<PublicSettings>
    set: (patch: SettingsPatch) => Promise<PublicSettings>
  }
  claude: {
    // Checks Claude is reachable with the API key, or the Claude Code sign-in if none.
    test: () => Promise<Result<{ via: 'api-key' | 'claude-login' }>>
    research: (req: ResearchRequest) => Promise<Result<ResearchResult>>
    draft: (req: DraftRequest) => Promise<Result<DraftResult>>
    chat: (req: ChatRequest) => Promise<Result<ChatResult>>
    learnVoice: (req: VoiceLearnRequest) => Promise<Result<VoiceLearnResult>>
    // Subscribe to progress for running requests; returns an unsubscribe function.
    onProgress: (cb: (p: ClaudeProgress) => void) => () => void
  }
  mail: {
    // Connects with the saved settings and reports the Drafts folder it found.
    test: () => Promise<Result<{ draftsMailbox: string }>>
    saveDraft: (draft: DraftInput) => Promise<Result<DraftRef>>
    deleteDraft: (ref: DraftRef) => Promise<Result<null>>
  }
}
