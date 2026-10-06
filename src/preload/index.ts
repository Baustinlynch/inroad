import { contextBridge, ipcRenderer } from 'electron'
import type { InroadApi } from '../shared/api'

const api: InroadApi = {
  platform: process.platform,
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  mail: {
    test: () => ipcRenderer.invoke('mail:test'),
    saveDraft: (draft) => ipcRenderer.invoke('mail:saveDraft', draft),
    deleteDraft: (ref) => ipcRenderer.invoke('mail:deleteDraft', ref),
  },
}

contextBridge.exposeInMainWorld('api', api)
