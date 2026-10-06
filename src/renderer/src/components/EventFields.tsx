import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface EventInfo {
  name: string
  // Freeform notes about the event, shared by every campaign.
  details: string
}

// Event name + details, with a button that has Claude look the event up in
// the user's connected tools (Slack, email…) and on the web.
export function EventFields({ event, onChange, autoFocus }: { event: EventInfo; onChange: (e: EventInfo) => void; autoFocus?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [error, setError] = useState('')
  const job = useRef('')
  // Latest event for when the lookup finishes (the user may keep typing).
  const latest = useRef(event)
  latest.current = event

  useEffect(
    () =>
      window.api?.claude.onProgress((p) => {
        if (p.jobId === job.current && p.kind === 'step') setSteps((s) => [...s, p.text])
      }),
    [],
  )

  const lookUp = async () => {
    if (!window.api || !event.name.trim()) return
    job.current = crypto.randomUUID()
    setBusy(true)
    setSteps([])
    setSources([])
    setError('')
    const res = await window.api.claude.lookupEvent({ jobId: job.current, name: event.name.trim(), hint: event.details.trim() || undefined })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setSources(res.value.sources)
    // Keep anything the user had written, above what Claude found.
    const mine = latest.current.details.trim()
    onChange({ ...latest.current, details: mine ? `${mine}\n\n${res.value.details}` : res.value.details })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="event-name">Event name</Label>
        <div className="flex gap-2">
          <Input
            id="event-name"
            autoFocus={autoFocus}
            value={event.name}
            onChange={(e) => onChange({ ...event, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && lookUp()}
            placeholder="e.g. Hack the Harbour 2026"
          />
          <Button variant="outline" onClick={lookUp} disabled={busy || !event.name.trim() || !window.api}>
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
        <Label htmlFor="event-details">About the event</Label>
        <Textarea
          id="event-details"
          value={event.details}
          onChange={(e) => onChange({ ...event, details: e.target.value })}
          placeholder="What it is, when and where, who comes and how many, past numbers, links. Claude uses this in every email."
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
