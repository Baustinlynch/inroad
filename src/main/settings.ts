import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MailSettings, PublicSettings, SettingsPatch } from '../shared/api'

// Secrets are encrypted with the OS keychain (safeStorage) before touching disk.
interface StoredSettings {
  mail: MailSettings | null
  mailPassword?: string // base64 of encrypted bytes
  anthropicKey?: string
}

const file = () => join(app.getPath('userData'), 'settings.json')

async function read(): Promise<StoredSettings> {
  try {
    return JSON.parse(await readFile(file(), 'utf8'))
  } catch {
    return { mail: null }
  }
}

async function write(s: StoredSettings) {
  await mkdir(dirname(file()), { recursive: true })
  await writeFile(file(), JSON.stringify(s, null, 2), { mode: 0o600 })
}

function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system')
  return safeStorage.encryptString(plain).toString('base64')
}

const decrypt = (enc?: string) => (enc ? safeStorage.decryptString(Buffer.from(enc, 'base64')) : undefined)

const toPublic = (s: StoredSettings): PublicSettings => ({
  mail: s.mail,
  hasMailPassword: !!s.mailPassword,
  hasAnthropicKey: !!s.anthropicKey,
})

export async function getPublicSettings() {
  return toPublic(await read())
}

export async function updateSettings(patch: SettingsPatch) {
  const s = await read()
  if (patch.mail) s.mail = patch.mail
  // Empty string clears a secret; undefined leaves it unchanged.
  if (patch.mailPassword !== undefined) s.mailPassword = patch.mailPassword ? encrypt(patch.mailPassword) : undefined
  if (patch.anthropicKey !== undefined) s.anthropicKey = patch.anthropicKey ? encrypt(patch.anthropicKey) : undefined
  await write(s)
  return toPublic(s)
}

// Main-process only: full settings including decrypted secrets.
export async function getSecrets() {
  const s = await read()
  return { mail: s.mail, mailPassword: decrypt(s.mailPassword), anthropicKey: decrypt(s.anthropicKey) }
}
