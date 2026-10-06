import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import type { Attachment } from '../shared/api'

// Attachments are copied to userData/attachments/<id>/<name>. The renderer
// only ever passes back { id, name }, never a path, so it can't point the
// mail code at arbitrary files on disk.
const root = () => join(app.getPath('userData'), 'attachments')
const ID = /^[0-9a-f-]{36}$/

export async function pickAttachments(win: BrowserWindow | null): Promise<Attachment[]> {
  const opts: Electron.OpenDialogOptions = { title: 'Attach to every email', properties: ['openFile', 'multiSelections'] }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled) return []
  return Promise.all(
    res.filePaths.map(async (path) => {
      const id = randomUUID()
      const name = basename(path)
      await mkdir(join(root(), id), { recursive: true })
      await copyFile(path, join(root(), id, name))
      return { id, name, size: (await stat(path)).size }
    }),
  )
}

// Where a stored attachment lives, for the mail composer. Throws if it's gone.
export async function attachmentFile(a: Attachment): Promise<{ filename: string; path: string }> {
  if (!ID.test(a.id) || a.name !== basename(a.name) || a.name.startsWith('.')) throw new Error(`Invalid attachment “${a.name}”`)
  const path = join(root(), a.id, a.name)
  try {
    await stat(path)
  } catch {
    throw new Error(`The attachment “${a.name}” is missing. Remove it from the campaign and attach it again.`)
  }
  return { filename: a.name, path }
}
