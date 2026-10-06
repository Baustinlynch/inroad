import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// The parts of a folder these fields edit.
export interface FolderInfo {
  name: string
  notes: string
}

// A folder's name and shared context, with a button that has Claude look it
// up (usually an event) in the user's connected tools (Slack, email…) and on the web.
export function FolderFields({ folder, onChange, autoFocus }: { folder: FolderInfo; onChange: (f: FolderInfo) => void; autoFocus?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [error, setError] = useState('')
  const job = useRef('')
  // Latest values for when the lookup finishes (the user may keep typing).
  const latest = useRef(folder)
  latest.current = folder

  useEffect(
    () =>
      window.api?.claude.onProgress((p) => {
        if (p.jobId === job.current && p.kind === 'step') setSteps((s) => [...s, p.text])
      }),
    [],
  )

  const lookUp = async () => {
    if (!window.api || !folder.name.trim()) return
    job.current = crypto.randomUUID()
    setBusy(true)
    setSteps([])
    setSources([])
    setError('')
    const res = await window.api.claude.lookupEvent({ jobId: job.current, name: folder.name.trim(), hint: folder.notes.trim() || undefined })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setSources(res.value.sources)
    // Keep anything the user had written, above what Claude found.
    const mine = latest.current.notes.trim()
    onChange({ ...latest.current, notes: mine ? `${mine}\n\n${res.value.details}` : res.value.details })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="folder-name">Name</Label>
        <div className="flex gap-2">
          <Input
            id="folder-name"
            autoFocus={autoFocus}
            value={folder.name}
            onChange={(e) => onChange({ ...folder, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && lookUp()}
            placeholder="e.g. Hack the Harbour 2026"
          />
          <Button variant="outline" onClick={lookUp} disabled={busy || !folder.name.trim() || !window.api}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Find details
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Claude searches the web and anything connected to your Claude account, like Slack or email. It only reads; it never sends or changes anything.
        </p>
      </div>

      {(busy || error) && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          {error ? (
            <p className="flex items-start gap-2 text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          ) : (
            <ol className="space-y-1">
              {(steps.length ? steps : ['Starting…']).slice(-5).map((s, i, all) => (
                <li key={i} className={i === all.length - 1 ? 'flex items-center gap-2 text-foreground' : 'pl-6'}>
                  {i === all.length - 1 && <Loader2 className="size-4 animate-spin" />}
                  {s}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="folder-notes">Shared context</Label>
        <Textarea
          id="folder-notes"
          value={folder.notes}
          onChange={(e) => onChange({ ...folder, notes: e.target.value })}
          placeholder="What it is, when and where, who comes and how many, past numbers, links. Every campaign in this folder uses it."
          className="min-h-48 leading-relaxed"
        />
        {sources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Found in: {sources.slice(0, 6).join(' · ')}
            {sources.length > 6 && ` and ${sources.length - 6} more`}. Check it over before you continue.
          </p>
        )}
      </div>
    </div>
  )
}
