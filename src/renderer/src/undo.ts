import type { EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'

// One undo timeline for the whole app. App actions (accepting a suggestion,
// saving, restoring a version…) live on the app stack; typing lives in the
// email editor's own history. ⌘Z undoes whichever happened most recently.

export interface UndoEntry {
  label: string
  // Undo jumps here first, so you see what's being undone.
  prospectId?: string
  // The editor (and its history depth) when the action happened. Typing in
  // that same editor since then is newer, so it gets undone first.
  editor: Editor | null
  editorDepth: number
  undo: () => string | void
  redo: () => void
}

export function currentEditor(): Editor | null {
  return (document.getElementById('email-body') as (HTMLElement & { editor?: Editor }) | null)?.editor ?? null
}

// Read the history plugin's state off the editor itself rather than via
// prosemirror-history's helpers, which can see a different module copy.
export function historyDepth(state: EditorState, which: 'done' | 'undone' = 'done'): number {
  const plugin = state.plugins.find((p) => (p as unknown as { key: string }).key.startsWith('history$'))
  const hist = plugin?.getState(state) as { done: { eventCount: number }; undone: { eventCount: number } } | undefined
  return hist ? hist[which].eventCount : 0
}

export const undoBridge = {
  // Called by the editor on ⌘Z / ⌘⇧Z. Return true if the app handled it.
  undo: (_editor: Editor | null, _depth: number) => false,
  redo: (_redoDepth: number) => false,
}
