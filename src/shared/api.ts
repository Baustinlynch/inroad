// The surface the preload script exposes to the renderer as `window.api`.
// Kept small and explicit: the renderer never gets raw ipcRenderer access.

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
  mail: {
    // Connects with the saved settings and reports the Drafts folder it found.
    test: () => Promise<Result<{ draftsMailbox: string }>>
    saveDraft: (draft: DraftInput) => Promise<Result<DraftRef>>
    deleteDraft: (ref: DraftRef) => Promise<Result<null>>
  }
}
