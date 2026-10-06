import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// App state lives in one JSON file in the user's app-data folder. Small enough
// for a personal tool; swap for SQLite if it ever outgrows this.
const file = () => join(app.getPath('userData'), 'inroad-data.json')

export async function loadState(): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file(), 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// Saves are serialised and atomic (write a temp file, then rename), so a crash
// mid-write never leaves a half-written state file.
let queue: Promise<void> = Promise.resolve()
export function saveState(data: unknown): Promise<void> {
  queue = queue.then(async () => {
    const path = file()
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify(data))
    await rename(tmp, path)
  })
  return queue
}
