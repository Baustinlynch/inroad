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
  // Emails the user wrote: either Claude's draft and what they saved
  // instead, or (no draft) one they pasted in.
  examples: { draft?: string; final: string }[]
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
  // Markdown (the same dialect the app stores; see markdown.ts).
  body: string
}

export interface ChatRequest {
  jobId: string
  company: string
  campaignNotes: string
  brief?: Brief
  voice: VoiceInput
  subject: string
  // The email body as markdown; suggested edits quote from this.
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

// Onboarding: find what's known about the user's event, via the web and any
// connectors (Slack, email…) on their Claude account.
export interface EventLookupRequest {
  jobId: string
  name: string
  // Anything else the user typed, e.g. "UNSW, November".
  hint?: string
}

export interface EventLookupResult {
  // Notes for the campaign: dates, place, audience, numbers, what's being asked for.
  details: string
  // Where each part came from, e.g. "Slack #organisers", a URL.
  sources: string[]
}

// Onboarding: style notes drawn from emails the user wrote.
export interface WritingRulesRequest {
  emails: string[]
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

// Which agent backend Inroad runs.
export type AiProvider = 'claude' | 'opencode'

// How Inroad reaches the opencode CLI. Empty path means "opencode" on PATH.
export interface OpencodeSettings {
  path: string
  model: string
  agent: string
}

// What the renderer sees: secrets are never sent back, only whether they're set.
export interface PublicSettings {
  mail: MailSettings | null
  hasMailPassword: boolean
  // Optional: without one, Claude runs on this computer's Claude Code sign-in.
  hasAnthropicKey: boolean
  aiProvider: AiProvider
  opencode: OpencodeSettings
  // False when the OS has no keychain, so secrets are stored unencrypted locally.
  secureStorage: boolean
}

export interface SettingsPatch {
  mail?: MailSettings
  mailPassword?: string
  anthropicKey?: string
  aiProvider?: AiProvider
  opencodePath?: string
  opencodeModel?: string
  opencodeAgent?: string
}

// A file attached to a campaign's emails. Picked files are copied into
// Inroad's own folder, so moving or deleting the original doesn't break it.
export interface Attachment {
  id: string
  name: string
  size: number
}

export interface DraftInput {
  to: string[]
  subject: string
  html: string
  text: string
  attachments: Attachment[]
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
    // Checks the agent backend is reachable: the API key or Claude Code sign-in,
    // or the opencode CLI when that's the chosen provider.
    test: () => Promise<Result<{ via: 'api-key' | 'claude-login' | 'opencode' }>>
    research: (req: ResearchRequest) => Promise<Result<ResearchResult>>
    draft: (req: DraftRequest) => Promise<Result<DraftResult>>
    chat: (req: ChatRequest) => Promise<Result<ChatResult>>
    learnVoice: (req: VoiceLearnRequest) => Promise<Result<VoiceLearnResult>>
    lookupEvent: (req: EventLookupRequest) => Promise<Result<EventLookupResult>>
    writingRules: (req: WritingRulesRequest) => Promise<Result<{ notes: string[] }>>
    // Subscribe to progress for running requests; returns an unsubscribe function.
    onProgress: (cb: (p: ClaudeProgress) => void) => () => void
  }
  files: {
    // Opens the system file picker; resolves to [] if cancelled.
    pickAttachments: () => Promise<Attachment[]>
  }
  mail: {
    // Connects with the saved settings and reports the Drafts folder it found.
    test: () => Promise<Result<{ draftsMailbox: string }>>
    saveDraft: (draft: DraftInput) => Promise<Result<DraftRef>>
    deleteDraft: (ref: DraftRef) => Promise<Result<null>>
  }
}
