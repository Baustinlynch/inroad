import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Check, CircleAlert, KeyRound, Loader2, Terminal, Wand2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { PublicSettings } from '../../../shared/api'

type Choice = 'login' | 'key' | 'opencode'

// Setup step: how Inroad talks to an AI agent. Checks the connection before
// moving on, but lets the user continue anyway (they can fix it later in Settings).
export function ClaudeSetupDialog({
  open,
  onOpenChange,
  settings,
  onSettings,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: PublicSettings | null
  onSettings: (s: PublicSettings) => void
  onDone: () => void
}) {
  const [choice, setChoice] = useState<Choice>('login')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const desktop = !!window.api

  useEffect(() => {
    if (!open) return
    setChoice(settings?.aiProvider === 'opencode' ? 'opencode' : settings?.hasAnthropicKey ? 'key' : 'login')
    setError('')
    setKey('')
  }, [open, settings?.hasAnthropicKey, settings?.aiProvider])

  const pick = (c: Choice) => {
    setChoice(c)
    setError('')
  }

  const check = async () => {
    if (!window.api) return onDone()
    setBusy(true)
    setError('')
    try {
      if (choice === 'opencode') onSettings(await window.api.settings.set({ aiProvider: 'opencode' }))
      else {
        // Choosing a Claude option switches back to Claude; a login clears any key.
        if (settings?.aiProvider === 'opencode') onSettings(await window.api.settings.set({ aiProvider: 'claude' }))
        if (choice === 'login' && settings?.hasAnthropicKey) onSettings(await window.api.settings.set({ anthropicKey: '' }))
        if (choice === 'key' && key.trim()) onSettings(await window.api.settings.set({ anthropicKey: key.trim() }))
      }
      const res = await window.api.claude.test()
      if (res.ok) return onDone()
      setError(res.error)
    } finally {
      setBusy(false)
    }
  }

  const canCheck = choice !== 'key' || !!key.trim() || !!settings?.hasAnthropicKey

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an AI agent</DialogTitle>
          <DialogDescription>
            Inroad uses an AI agent to research organisations, draft your emails and power the chat. Pick how to connect — you can change this later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2" role="radiogroup" aria-label="How Inroad connects to an AI agent">
          <Option
            selected={choice === 'login'}
            onSelect={() => pick('login')}
            icon={<Terminal />}
            title="Use my Claude Code login"
            description={
              <>
                Not logged in? Install Claude Code, run <code className="rounded bg-muted px-1 py-0.5 text-xs">claude</code> in a terminal and sign in, then
                check again.
              </>
            }
          />
          <Option
            selected={choice === 'key'}
            onSelect={() => pick('key')}
            icon={<KeyRound />}
            title="Use an Anthropic API key"
            description={
              <>
                Billed per token to your API account. Create one at{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline">
                  console.anthropic.com
                </a>
                .
              </>
            }
          >
            {choice === 'key' && (
              <>
                <Input
                  autoFocus
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canCheck && check()}
                  placeholder={settings?.hasAnthropicKey ? 'Saved — type to replace' : 'sk-ant-…'}
                  className="mt-2"
                />
                {settings && !settings.secureStorage && (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                    No system keychain found — the key will be saved unencrypted in Inroad’s settings file.
                  </p>
                )}
              </>
            )}
          </Option>
          <Option
            selected={choice === 'opencode'}
            onSelect={() => pick('opencode')}
            icon={<Wand2 />}
            title="Use opencode"
            description={
              <>
                Runs the opencode CLI installed on this computer, with your own providers and models. Configure the path, model and agent in Settings → AI
                agent.
              </>
            }
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        {!desktop && <p className="text-sm text-muted-foreground">AI agents only connect in the desktop app.</p>}

        <DialogFooter>
          {error && (
            <Button variant="ghost" onClick={onDone}>
              Continue anyway
            </Button>
          )}
          <Button onClick={check} disabled={busy || !canCheck}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} {error ? 'Check again' : 'Check & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Option({
  selected,
  onSelect,
  icon,
  title,
  description,
  children,
}: {
  selected: boolean
  onSelect: () => void
  icon: ReactNode
  title: string
  description: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && e.target === e.currentTarget && (e.preventDefault(), onSelect())}
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 text-xs/relaxed text-muted-foreground">{description}</p>
        {children}
      </div>
      <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', selected && 'border-primary bg-primary')}>
        {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
      </span>
    </div>
  )
}
