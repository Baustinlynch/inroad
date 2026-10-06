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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Building2, Flag, History, MessageSquare, PenLine, RotateCcw, StickyNote, Trash2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Hint } from './hint'

export type TrashKind = 'organisation' | 'campaign' | 'voice' | 'note' | 'chat' | 'version'

export interface TrashItem {
  key: string
  kind: TrashKind
  label: string
  // Where it lived, e.g. "Sponsors" or "Lumen Labs".
  context: string
  deletedAt: number
}

const kinds: Record<TrashKind, { title: string; Icon: LucideIcon }> = {
  organisation: { title: 'Organisations', Icon: Building2 },
  campaign: { title: 'Campaigns', Icon: Flag },
  voice: { title: 'Voices', Icon: PenLine },
  note: { title: 'Style notes', Icon: StickyNote },
  chat: { title: 'Chats', Icon: MessageSquare },
  version: { title: 'Email versions', Icon: History },
}

function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function ConfirmPurge({ title, description, children, onConfirm }: { title: string; description: string; children: ReactNode; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TrashView({
  items,
  onRestore,
  onPurge,
  onEmpty,
}: {
  items: TrashItem[]
  onRestore: (item: TrashItem) => void
  onPurge: (item: TrashItem) => void
  onEmpty: () => void
}) {
  const groups = (Object.keys(kinds) as TrashKind[])
    .map((kind) => ({ kind, items: items.filter((i) => i.kind === kind).sort((a, b) => b.deletedAt - a.deletedAt) }))
    .filter((g) => g.items.length)

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="drag flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Hint label="Toggle sidebar" keys="⌘ \">
          <SidebarTrigger />
        </Hint>
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
        <h1 className="flex-1 font-heading text-base font-semibold">Deleted items</h1>
        {items.length > 0 && (
          <ConfirmPurge
            title={`Permanently delete ${items.length} item${items.length === 1 ? '' : 's'}?`}
            description="Everything in Deleted items will be gone for good. This can't be undone."
            onConfirm={onEmpty}
          >
            <Button variant="ghost" size="sm" className="text-destructive">
              <Trash2 /> Empty
            </Button>
          </ConfirmPurge>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] space-y-6 px-6 py-6">
          <p className="text-sm text-muted-foreground">
            Deleting something moves it here. Restore puts it back where it was; nothing is removed for good until you delete it from here.
          </p>
          {groups.length === 0 && (
            <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              <Trash2 className="mb-2 size-5" />
              Nothing deleted.
            </div>
          )}
          {groups.map(({ kind, items }) => {
            const { title, Icon } = kinds[kind]
            return (
              <section key={kind}>
                <h2 className="mb-2 text-xs font-medium text-muted-foreground">
                  {title} <span className="text-muted-foreground/70">{items.length}</span>
                </h2>
                <div className="divide-y rounded-lg border">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.context} · deleted {ago(item.deletedAt)}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => onRestore(item)}>
                        <RotateCcw /> Restore
                      </Button>
                      <ConfirmPurge title={`Permanently delete “${item.label}”?`} description="This can't be undone." onConfirm={() => onPurge(item)}>
                        <Button variant="ghost" size="icon-sm" title="Delete forever" className="text-muted-foreground hover:text-destructive">
                          <Trash2 />
                        </Button>
                      </ConfirmPurge>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
