import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Check, CircleAlert, Database, KeyRound, Loader2, Mail, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { MailSettings, PublicSettings } from '../../../shared/api'

// Common providers' IMAP servers. All of them want an app-specific password
// rather than your normal login password.
const PROVIDERS = {
  gmail: { label: 'Gmail', host: 'imap.gmail.com', port: 993, secure: true, help: 'Use an app password (Google Account → Security → App passwords).' },
  fastmail: { label: 'Fastmail', host: 'imap.fastmail.com', port: 993, secure: true, help: 'Use an app password (Settings → Privacy & Security → App passwords).' },
  icloud: { label: 'iCloud', host: 'imap.mail.me.com', port: 993, secure: true, help: 'Use an app-specific password from appleid.apple.com.' },
  outlook: { label: 'Outlook', host: 'outlook.office365.com', port: 993, secure: true, help: 'Your account may need IMAP enabled and an app password.' },
  other: { label: 'Other', host: '', port: 993, secure: true, help: 'Ask your provider for their IMAP server details.' },
} as const
type Provider = keyof typeof PROVIDERS

const detect = (host: string): Provider => (Object.entries(PROVIDERS).find(([, p]) => p.host && p.host === host)?.[0] as Provider) ?? 'other'

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
  onReset,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  settings: PublicSettings | null
  onSaved: (s: PublicSettings) => void
  // Replaces every organisation, campaign and voice with a blank start.
  onReset: () => void
}) {
  const [provider, setProvider] = useState<Provider>('gmail')
  const [mail, setMail] = useState<MailSettings>({ host: PROVIDERS.gmail.host, port: 993, secure: true, user: '', fromName: '', fromEmail: '' })
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [claudeTest, setClaudeTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingClaude, setTestingClaude] = useState(false)

  // Start from what's saved each time the dialog opens; secrets are never sent back.
  useEffect(() => {
    if (!open) return
    if (settings?.mail) {
      setMail(settings.mail)
      setProvider(detect(settings.mail.host))
    }
    setPassword('')
    setApiKey('')
    setTest(null)
    setClaudeTest(null)
  }, [open, settings])

  const pick = (p: Provider) => {
    setProvider(p)
    if (p !== 'other') setMail((m) => ({ ...m, host: PROVIDERS[p].host, port: PROVIDERS[p].port, secure: PROVIDERS[p].secure }))
  }

  const desktop = !!window.api
  const mailComplete = !!(mail.host && mail.port && mail.user && mail.fromEmail && (password || settings?.hasMailPassword))

  const saveMail = async (thenTest: boolean) => {
    if (!window.api) return
    setBusy(true)
    setTest(null)
    try {
      const next = await window.api.settings.set({ mail, ...(password ? { mailPassword: password } : {}) })
      onSaved(next)
      setPassword('')
      if (thenTest) {
        const res = await window.api.mail.test()
        setTest(res.ok ? { ok: true, message: `Connected. Drafts will go to “${res.value.draftsMailbox}”.` } : { ok: false, message: res.error })
      }
    } finally {
      setBusy(false)
    }
  }

  const saveKey = async () => {
    if (!window.api) return
    setBusy(true)
    try {
      onSaved(await window.api.settings.set({ anthropicKey: apiKey }))
      setApiKey('')
      setClaudeTest(null)
    } finally {
      setBusy(false)
    }
  }

  const testClaude = async () => {
    if (!window.api) return
    setTestingClaude(true)
    setClaudeTest(null)
    try {
      const res = await window.api.claude.test()
      setClaudeTest(
        res.ok ? { ok: true, message: res.value.via === 'api-key' ? 'Connected with your API key.' : 'Connected with your Claude sign-in.' } : { ok: false, message: res.error },
      )
    } finally {
      setTestingClaude(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Passwords and keys are stored in your system keychain and never leave this computer except to sign in.</DialogDescription>
        </DialogHeader>
        {!desktop && <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">Settings are only available in the desktop app.</p>}

        <Tabs defaultValue="mail">
          <TabsList className="w-full">
            <TabsTrigger value="mail">
              <Mail /> Mailbox
              {settings?.mail && settings.hasMailPassword && <Check className="text-success" />}
            </TabsTrigger>
            <TabsTrigger value="claude">
              <KeyRound /> Claude
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database /> Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mail" className="mt-3 grid gap-3">
            <p className="text-sm text-muted-foreground">Inroad saves emails to your Drafts folder over IMAP. It never sends anything.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Your name" htmlFor="fromName">
                <Input id="fromName" value={mail.fromName} onChange={(e) => setMail({ ...mail, fromName: e.target.value })} placeholder="Jordan Ellis" />
              </Field>
              <Field label="Email address" htmlFor="fromEmail">
                <Input
                  id="fromEmail"
                  type="email"
                  value={mail.fromEmail}
                  // The login is usually the same as the address; keep them in step until the user changes it.
                  onChange={(e) => setMail({ ...mail, fromEmail: e.target.value, user: mail.user === mail.fromEmail ? e.target.value : mail.user })}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
            <Field label="Provider" htmlFor="provider" hint={PROVIDERS[provider].help}>
              <Select value={provider} onValueChange={(v) => pick(v as Provider)}>
                <SelectTrigger id="provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDERS[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {provider === 'other' && (
              <div className="grid grid-cols-[1fr_6rem_8rem] gap-3">
                <Field label="IMAP server" htmlFor="host">
                  <Input id="host" value={mail.host} onChange={(e) => setMail({ ...mail, host: e.target.value.trim() })} placeholder="imap.example.com" />
                </Field>
                <Field label="Port" htmlFor="port">
                  <Input id="port" inputMode="numeric" value={mail.port} onChange={(e) => setMail({ ...mail, port: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Security" htmlFor="secure">
                  <Select value={mail.secure ? 'tls' : 'starttls'} onValueChange={(v) => setMail({ ...mail, secure: v === 'tls' })}>
                    <SelectTrigger id="secure" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">SSL/TLS</SelectItem>
                      <SelectItem value="starttls">STARTTLS</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username" htmlFor="user">
                <Input id="user" value={mail.user} onChange={(e) => setMail({ ...mail, user: e.target.value })} placeholder="Usually your email" />
              </Field>
              <Field label="App password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={settings?.hasMailPassword ? 'Saved — type to replace' : ''}
                />
              </Field>
            </div>
            {test && (
              <p className={`flex items-start gap-2 text-sm ${test.ok ? 'text-success' : 'text-destructive'}`}>
                {test.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
                {test.message}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={!desktop || busy || !mailComplete} onClick={() => saveMail(false)}>
                Save
              </Button>
              <Button disabled={!desktop || busy || !mailComplete} onClick={() => saveMail(true)}>
                {busy && <Loader2 className="animate-spin" />} Save & test connection
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="claude" className="mt-3 grid gap-3">
            <p className="text-sm text-muted-foreground">
              Claude researches each organisation, drafts emails and powers the chat. It uses the Claude Code sign-in on this computer, so it runs on your
              Claude plan. Not signed in? Run <code className="rounded bg-muted px-1 py-0.5 text-xs">claude</code> in a terminal once and log in.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" disabled={!desktop || testingClaude} onClick={testClaude}>
                {testingClaude && <Loader2 className="animate-spin" />} Test connection
              </Button>
              {claudeTest && (
                <p className={`flex items-start gap-2 text-sm ${claudeTest.ok ? 'text-success' : 'text-destructive'}`}>
                  {claudeTest.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
                  {claudeTest.message}
                </p>
              )}
            </div>
            <Separator className="my-1" />
            <Field
              label="Anthropic API key (optional)"
              htmlFor="apiKey"
              hint={
                <>
                  Used instead of your sign-in, billed per token. Create one at{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline">
                    console.anthropic.com
                  </a>
                  .
                </>
              }
            >
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.hasAnthropicKey ? 'Saved — type to replace' : 'sk-ant-…'}
              />
            </Field>
            {settings?.hasAnthropicKey && (
              <Badge variant="secondary" className="w-fit gap-1">
                <Check className="text-success" /> Using your API key
              </Badge>
            )}
            <DialogFooter>
              {settings?.hasAnthropicKey && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={!desktop || busy}
                  onClick={() => window.api?.settings.set({ anthropicKey: '' }).then((next) => (onSaved(next), setClaudeTest(null)))}
                >
                  Remove key
                </Button>
              )}
              <Button disabled={!desktop || busy || !apiKey.trim()} onClick={saveKey}>
                Save key
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="data" className="mt-3 grid gap-3">
            <p className="text-sm text-muted-foreground">
              Everything you write in Inroad is stored on this computer. Starting fresh permanently removes all organisations, emails, chats, campaigns
              and voices, including Deleted items, then runs setup again. Your mailbox and Claude settings stay, and nothing in your mailbox is touched.
            </p>
            <DialogFooter>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 /> Start fresh…
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start fresh?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All organisations, emails, chats, campaigns and voices will be deleted for good. This can’t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onReset}>
                      Delete everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
