import type { InroadApi } from '../shared/api'

declare global {
  interface Window {
    // Absent when the renderer runs in a plain browser (e.g. `vite` preview).
    api?: InroadApi
  }
}
