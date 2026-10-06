import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type { Result } from '../shared/api'
import { deleteDraft, saveDraft, testMail, type MailCreds } from './mail'
import { getPublicSettings, getSecrets, updateSettings } from './settings'
import { loadState, saveState } from './store'

// Runs a mail operation with the saved (keychain-decrypted) credentials.
async function withMail<T>(fn: (creds: MailCreds) => Promise<Result<T>>): Promise<Result<T>> {
  const { mail, mailPassword } = await getSecrets()
  if (!mail || !mailPassword) return { ok: false, error: 'Connect your mailbox in Settings first' }
  return fn({ mail, password: mailPassword })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Inroad',
    // Native-feeling macOS window: content runs under the traffic lights.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0f1011',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Links (e.g. in the research brief) open in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('au.ingo.inroad')
  // Dev: F12 toggles devtools; prod: disables reload shortcuts.
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  ipcMain.handle('store:load', () => loadState())
  ipcMain.handle('store:save', (_e, data: unknown) => saveState(data))
  ipcMain.handle('settings:get', () => getPublicSettings())
  ipcMain.handle('settings:set', (_e, patch) => updateSettings(patch))
  ipcMain.handle('mail:test', () => withMail((c) => testMail(c)))
  ipcMain.handle('mail:saveDraft', (_e, draft) => withMail((c) => saveDraft(c, draft)))
  ipcMain.handle('mail:deleteDraft', (_e, ref) => withMail((c) => deleteDraft(c, ref)))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
