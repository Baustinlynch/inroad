import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Check, Flag, Paperclip, PenLine, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Campaign, Voice } from '../data'
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
        <p className="text-xs text-muted-foreground">Each one is researched and drafted from this campaign’s notes, in {voiceName}’s voice.</p>
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

export type ProfilesTarget = { kind: 'campaign' | 'voice'; id: string }

interface ProfilesProps {
  target: ProfilesTarget | null
  onTarget: (t: ProfilesTarget | null) => void
  campaigns: Campaign[]
  voices: Voice[]
  onUpdateCampaign: (id: string, patch: Partial<Campaign>) => void
  onCreateCampaign: () => string
  onDeleteCampaign: (id: string) => void
  onDeleteVoice: (id: string) => void
  onDeleteVoiceNote: (voiceId: string, note: string) => void
}

export function ProfilesDialog({
  target,
  onTarget,
  campaigns,
  voices,
  onUpdateCampaign,
  onCreateCampaign,
  onDeleteCampaign,
  onDeleteVoice,
  onDeleteVoiceNote,
}: ProfilesProps) {
  const campaign = target?.kind === 'campaign' ? campaigns.find((c) => c.id === target.id) : undefined
  const voice = target?.kind === 'voice' ? voices.find((v) => v.id === target.id) : undefined

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onTarget(null)}>
      <DialogContent className="flex h-[min(600px,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Campaigns & voices</DialogTitle>
          <DialogDescription className="sr-only">Edit campaign notes and voice profiles</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav className="w-60 shrink-0 space-y-6 overflow-y-auto border-r bg-muted/30 p-3">
            <NavGroup title="Campaigns">
              {campaigns.map((c) => (
                <NavItem
                  key={c.id}
                  icon={<Flag />}
                  active={target?.kind === 'campaign' && target.id === c.id}
                  onClick={() => onTarget({ kind: 'campaign', id: c.id })}
                  onDelete={campaigns.length > 1 ? () => onDeleteCampaign(c.id) : undefined}
                  deleteLabel="Delete campaign"
                >
                  {c.name || 'Untitled campaign'}
                </NavItem>
              ))}
              <NavItem icon={<Plus />} muted onClick={() => onTarget({ kind: 'campaign', id: onCreateCampaign() })}>
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
                  onDelete={voices.length > 1 ? () => onDeleteVoice(v.id) : undefined}
                  deleteLabel="Delete voice"
                >
                  {v.name}
                </NavItem>
              ))}
              <NavItem icon={<Plus />} muted>
                New voice
              </NavItem>
            </NavGroup>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
            {campaign && (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={campaign.name}
                    onChange={(e) => onUpdateCampaign(campaign.id, { name: e.target.value })}
                    placeholder="Campaign name"
                    autoFocus={!campaign.name}
                    className="flex-1 font-heading text-base font-semibold"
                  />
                  <Button variant="ghost" size="sm" className="text-destructive" disabled={campaigns.length < 2} onClick={() => onDeleteCampaign(campaign.id)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Written in</span>
                  {voices.map((v) => (
                    <Button
                      key={v.id}
                      size="xs"
                      variant={campaign.voiceId === v.id ? 'secondary' : 'ghost'}
                      onClick={() => onUpdateCampaign(campaign.id, { voiceId: v.id })}
                    >
                      {campaign.voiceId === v.id && <Check />} {v.name}
                    </Button>
                  ))}
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Write anything: what you’re reaching out about, what you’re asking for, what Claude should look for when researching each one, and how it
                  should sound. Claude reads this for every email in this campaign.
                </p>
                <Textarea
                  value={campaign.notes}
                  onChange={(e) => onUpdateCampaign(campaign.id, { notes: e.target.value })}
                  placeholder={
                    "e.g. We're running a 48-hour hackathon in November and need catering partners. Looking for local cafés and restaurants that could do 3 meals a day for 400 people at a discount, in exchange for branding."
                  }
                  className="min-h-56 flex-1 resize-none leading-relaxed"
                />
                <Separator className="my-4" />
                <div className="mb-2 text-xs font-medium text-muted-foreground">Attached to every email</div>
                <div className="flex flex-wrap items-center gap-2">
                  {campaign.attachments.map((a) => (
                    <Badge key={a} variant="secondary" className="gap-1.5 pr-1 font-normal">
                      <Paperclip className="size-3" />
                      {a}
                      <button
                        onClick={() => onUpdateCampaign(campaign.id, { attachments: campaign.attachments.filter((x) => x !== a) })}
                        className="opacity-60 hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <Button variant="outline" size="xs">
                    <Paperclip /> Attach file
                  </Button>
                </div>
              </>
            )}

            {voice && (
              <>
                <div className="flex items-start gap-2">
                  <h2 className="flex-1 font-heading text-base font-semibold">{voice.name}</h2>
                  <Button variant="ghost" size="sm" className="text-destructive" disabled={voices.length < 2} onClick={() => onDeleteVoice(voice.id)}>
                    <Trash2 /> Delete voice
                  </Button>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">{voice.description}</p>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Style notes</div>
                <ul className="divide-y rounded-lg border text-sm">
                  {voice.notes.filter((n) => !n.deletedAt).length === 0 && <li className="px-3 py-2 text-muted-foreground">No style notes yet.</li>}
                  {voice.notes.filter((n) => !n.deletedAt).map((n) => (
                    <li key={n.text} className="group flex items-start gap-2 px-3 py-2">
                      <span className="flex-1">{n.text}</span>
                      {n.fresh && <Badge className="shrink-0 bg-mark font-normal text-black">New · from Northwind edit</Badge>}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100"
                        title="Remove note"
                        onClick={() => onDeleteVoiceNote(voice.id, n.text)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" className="mt-2 self-start">
                  <Plus /> Add a note
                </Button>
                <Separator className="my-4" />
                <div className="mb-1 text-xs font-medium text-muted-foreground">Example emails</div>
                <p className="text-xs text-muted-foreground">
                  The 3 most recent edited emails are included in every draft as examples. Paste a past email you’ve sent to teach it faster.
                </p>
                <Button variant="outline" size="sm" className="mt-2 self-start">
                  <Plus /> Paste an email
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
