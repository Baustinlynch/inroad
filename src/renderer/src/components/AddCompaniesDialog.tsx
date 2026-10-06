import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { Campaign } from '../data'
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
        <p className="text-xs text-muted-foreground">Each one is researched and drafted from the folder’s context and this campaign’s notes, written in the “{voiceName}” voice.</p>
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
