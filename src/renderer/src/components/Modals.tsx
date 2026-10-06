import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CalendarDays, Check, Flag, Mail, Paperclip, PenLine, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MAX_VOICE_EXAMPLES, type Campaign, type Voice } from '../data'
import { EventFields, type EventInfo } from './EventFields'
import { ButtonKeys } from './hint'

export function AddCompaniesDialog({
  open,
  onOpenChange,
  campaign,
  voiceName,
  onAdd,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  campaign: Campaign
  voiceName: string
  onAdd: (orgs: { company: string; website: string }[]) => void
}) {
  const [text, setText] = useState('')
  const orgs = text
    .split('\n')
    .map((line) => {
      const [company, website = ''] = line.split(',').map((s) => s.trim())
      return { company, website }
    })
    .filter((o) => o.company)
  const names = orgs.map((o) => o.company)
  const submit = () => {
    if (!orgs.length) return
    onAdd(orgs)
    setText('')
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to {campaign.name}</DialogTitle>
          <DialogDescription>
            One per line. Add a website after a comma to skip the guesswork, e.g. <span className="font-medium text-foreground">Acme, acme.com</span>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
          rows={7}
          placeholder={'Brightline Health\nCobalt Systems, cobalt.example\nMeridian Bank'}
        />
        <p className="text-xs text-muted-foreground">Each one is researched and drafted from the event details and this campaign’s notes, written in the “{voiceName}” voice.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!names.length} onClick={submit}>
            <Sparkles /> Research {names.length || ''}
            <ButtonKeys keys="⌘ ↵" primary />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type ProfilesTarget = { kind: 'event' } | { kind: 'campaign' | 'voice'; id: string }

interface ProfilesProps {
  target: ProfilesTarget | null
  onTarget: (t: ProfilesTarget | null) => void
  event: EventInfo
  onUpdateEvent: (e: EventInfo) => void
  campaigns: Campaign[]
  voices: Voice[]
  onUpdateCampaign: (id: string, patch: Partial<Campaign>) => void
  onCreateCampaign: () => string
  onDeleteCampaign: (id: string) => void
  onAttach: (campaignId: string) => void
  onRemoveAttachment: (campaignId: string, attachmentId: string) => void
  onCreateVoice: () => string
  onUpdateVoice: (id: string, patch: Partial<Voice>) => void
  onDeleteVoice: (id: string) => void
  onAddVoiceNote: (voiceId: string, note: string) => void
  onDeleteVoiceNote: (voiceId: string, note: string) => void
  onAddExample: (voiceId: string, email: string) => void
  onDeleteExample: (voiceId: string, exampleId: string) => void
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export function ProfilesDialog(props: ProfilesProps) {
  const { target, onTarget, campaigns, voices } = props
  const campaign = target?.kind === 'campaign' ? campaigns.find((c) => c.id === target.id) : undefined
  const voice = target?.kind === 'voice' ? voices.find((v) => v.id === target.id) : undefined

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onTarget(null)}>
      <DialogContent className="flex h-[min(640px,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Event, campaigns & voices</DialogTitle>
          <DialogDescription className="sr-only">Edit the event, campaign notes and voice profiles</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav className="w-60 shrink-0 space-y-6 overflow-y-auto border-r bg-muted/30 p-3">
            <NavGroup title="Event">
              <NavItem icon={<CalendarDays />} active={target?.kind === 'event'} onClick={() => onTarget({ kind: 'event' })}>
                {props.event.name || 'Your event'}
              </NavItem>
            </NavGroup>
            <NavGroup title="Campaigns">
              {campaigns.map((c) => (
                <NavItem
                  key={c.id}
                  icon={<Flag />}
                  active={target?.kind === 'campaign' && target.id === c.id}
                  onClick={() => onTarget({ kind: 'campaign', id: c.id })}
                  onDelete={campaigns.length > 1 ? () => props.onDeleteCampaign(c.id) : undefined}
                  deleteLabel="Delete campaign"
                >
                  {c.name || 'Untitled campaign'}
                </NavItem>
              ))}
              <NavItem icon={<Plus />} muted onClick={() => onTarget({ kind: 'campaign', id: props.onCreateCampaign() })}>
                New campaign
              </NavItem>
            </NavGroup>
            <NavGroup title="Voices">
              {voices.map((v) => (
                <NavItem
                  key={v.id}
                  icon={<PenLine />}
                  active={target?.kind === 'voice' && target.id === v.id}
                  onClick={() => onTarget({ kind: 'voice', id: v.id })}
                  onDelete={voices.length > 1 ? () => props.onDeleteVoice(v.id) : undefined}
                  deleteLabel="Delete voice"
                >
                  {v.name || 'Untitled voice'}
                </NavItem>
              ))}
              <NavItem icon={<Plus />} muted onClick={() => onTarget({ kind: 'voice', id: props.onCreateVoice() })}>
                New voice
              </NavItem>
            </NavGroup>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
            {target?.kind === 'event' && (
              <>
                <p className="mb-4 text-sm text-muted-foreground">Shared by every campaign. Campaign notes then say what you’re asking each group for.</p>
                <EventFields event={props.event} onChange={props.onUpdateEvent} />
              </>
            )}

            {campaign && <CampaignPage {...props} campaign={campaign} />}
            {voice && <VoicePage key={voice.id} voice={voice} canDelete={voices.length > 1} {...props} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CampaignPage({ campaign, voices, campaigns, ...props }: ProfilesProps & { campaign: Campaign }) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={campaign.name}
          onChange={(e) => props.onUpdateCampaign(campaign.id, { name: e.target.value })}
          placeholder="Campaign name"
          autoFocus={!campaign.name}
          className="flex-1 font-heading text-base font-semibold"
        />
        <Button variant="ghost" size="sm" className="text-destructive" disabled={campaigns.length < 2} onClick={() => props.onDeleteCampaign(campaign.id)}>
          <Trash2 /> Delete
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Written in</span>
        {voices.map((v) => (
          <Button key={v.id} size="xs" variant={campaign.voiceId === v.id ? 'secondary' : 'ghost'} onClick={() => props.onUpdateCampaign(campaign.id, { voiceId: v.id })}>
            {campaign.voiceId === v.id && <Check />} {v.name}
          </Button>
        ))}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Who you’re contacting and what you’re asking them for, what Claude should look for when researching each one, and anything about tone. Claude reads this
        and the event details for every email in this campaign.
      </p>
      <Textarea
        value={campaign.notes}
        onChange={(e) => props.onUpdateCampaign(campaign.id, { notes: e.target.value })}
        placeholder="e.g. Local cafés and restaurants for catering. Asking for 3 meals a day for 400 people at a discount, in exchange for branding. Look for ones that have catered big events."
        className="min-h-56 flex-1 resize-none leading-relaxed"
      />
      <Separator className="my-4" />
      <div className="mb-2 text-xs font-medium text-muted-foreground">Attached to every email</div>
      <div className="flex flex-wrap items-center gap-2">
        {campaign.attachments.map((a) => (
          <Badge key={a.id} variant="secondary" className="gap-1.5 pr-1 font-normal">
            <Paperclip className="size-3" />
            {a.name}
            <span className="text-muted-foreground">{kb(a.size)}</span>
            <button onClick={() => props.onRemoveAttachment(campaign.id, a.id)} className="opacity-60 hover:opacity-100" title={`Remove ${a.name}`}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Button variant="outline" size="xs" onClick={() => props.onAttach(campaign.id)} disabled={!window.api}>
          <Paperclip /> Attach file
        </Button>
      </div>
    </>
  )
}

function VoicePage({ voice, canDelete, ...props }: ProfilesProps & { voice: Voice; canDelete: boolean }) {
  const [note, setNote] = useState('')
  const [pasting, setPasting] = useState(false)
  const [email, setEmail] = useState('')
  const notes = voice.notes.filter((n) => !n.deletedAt)
  const examples = (voice.examples ?? []).filter((e) => !e.deletedAt)
  const pasted = examples.filter((e) => !e.draft)
  const learned = examples.filter((e) => e.draft)

  const addNote = () => {
    if (!note.trim()) return
    props.onAddVoiceNote(voice.id, note.trim())
    setNote('')
  }
  const addEmail = () => {
    if (!email.trim()) return
    props.onAddExample(voice.id, email.trim())
    setEmail('')
    setPasting(false)
  }

  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <Input
          value={voice.name}
          onChange={(e) => props.onUpdateVoice(voice.id, { name: e.target.value })}
          placeholder="Voice name"
          autoFocus={!voice.name}
          className="flex-1 font-heading text-base font-semibold"
        />
        <Button variant="ghost" size="sm" className="text-destructive" disabled={!canDelete} onClick={() => props.onDeleteVoice(voice.id)}>
          <Trash2 /> Delete
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Learns from the edits you make before saving, and from emails you paste below.</p>

      <div className="mb-1 text-xs font-medium text-muted-foreground">Style notes</div>
      <ul className="divide-y rounded-lg border text-sm">
        {notes.length === 0 && <li className="px-3 py-2 text-muted-foreground">No style notes yet.</li>}
        {notes.map((n) => (
          <li key={n.text} className="group flex items-start gap-2 px-3 py-2">
            <span className="flex-1">{n.text}</span>
            {n.fresh && <Badge className="shrink-0 bg-mark font-normal text-black">New</Badge>}
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              title="Remove note"
              onClick={() => props.onDeleteVoiceNote(voice.id, n.text)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addNote()
        }}
      >
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note, e.g. Never use exclamation marks" className="h-8" />
        <Button type="submit" variant="outline" size="sm" disabled={!note.trim()}>
          <Plus /> Add
        </Button>
      </form>

      <Separator className="my-4" />
      <div className="mb-1 text-xs font-medium text-muted-foreground">Example emails</div>
      <p className="mb-2 text-xs text-muted-foreground">
        Claude sees every email you paste here, plus your {MAX_VOICE_EXAMPLES} most recent edited emails{learned.length ? ` (${learned.length} so far)` : ''}.
      </p>
      {pasted.length > 0 && (
        <ul className="mb-2 divide-y rounded-lg border text-sm">
          {pasted.map((e) => (
            <li key={e.id} className="group flex items-start gap-2 px-3 py-2">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2 flex-1 text-muted-foreground">{e.final}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title="Delete example"
                onClick={() => props.onDeleteExample(voice.id, e.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {pasting ? (
        <div className="grid gap-2">
          <Textarea
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && addEmail()}
            placeholder="Paste an email you wrote, greeting to sign-off."
            className="min-h-40"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPasting(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={addEmail} disabled={!email.trim()}>
              Add example <ButtonKeys keys="⌘ ↵" primary />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setPasting(true)}>
          <Plus /> Paste an email
        </Button>
      )}
    </>
  )
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 px-2.5 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function NavItem({
  icon,
  active,
  muted,
  onClick,
  onDelete,
  deleteLabel,
  children,
}: {
  icon: ReactNode
  active?: boolean
  muted?: boolean
  onClick?: () => void
  onDelete?: () => void
  deleteLabel?: string
  children: ReactNode
}) {
  return (
    <div className="group/nav relative">
      <Button
        variant={active ? 'secondary' : 'ghost'}
        onClick={onClick}
        className={cn('h-9 w-full justify-start gap-2.5 px-2.5', onDelete && 'pr-9', muted && 'text-muted-foreground')}
      >
        {icon}
        <span className="truncate">{children}</span>
      </Button>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-xs"
          title={deleteLabel}
          onClick={onDelete}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/nav:opacity-100 hover:text-destructive focus-visible:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  )
}
