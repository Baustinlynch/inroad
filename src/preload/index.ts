import { contextBridge, ipcRenderer } from 'electron'
import type { InroadApi } from '../shared/api'

const api: InroadApi = {
  platform: process.platform,
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
  },
}

contextBridge.exposeInMainWorld('api', api)
