// The surface the preload script exposes to the renderer as `window.api`.
// Kept small and explicit: the renderer never gets raw ipcRenderer access.
export interface InroadApi {
  // process.platform, e.g. 'darwin'.
  platform: string
  store: {
    // Returns the saved app state, or null on first run.
    load: () => Promise<unknown | null>
    save: (data: unknown) => Promise<void>
  }
}
