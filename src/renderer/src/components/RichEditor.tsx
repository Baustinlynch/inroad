import Blockquote from '@tiptap/extension-blockquote'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Bold, Check, Copy, ExternalLink, Italic, Link2, List, ListOrdered, Pencil, RemoveFormatting, Strikethrough, TextQuote, Underline, Unlink } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { currentEditor, historyDepth, undoBridge } from '../undo'
import { Hint, Keys } from './hint'

interface Props {
  value: string
  onChange: (html: string) => void
}

// What the link popover is editing: the range it applies to, plus the text and
// URL fields. `null` means the popover is just showing an existing link.
interface LinkDraft {
  from: number
  to: number
  text: string
  url: string
  isNew: boolean
}

// Deliberately small formatting set: no headings, sizes, fonts or colours, so
// emails stay looking like emails.
export function RichEditor({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null)
  const linkDraftRef = useRef(linkDraft)
  linkDraftRef.current = linkDraft
  const startLinkRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        trailingNode: false,
        blockquote: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
      }),
      // ⌘⇧B is the app-wide "brief" shortcut, so quotes are toolbar-only.
      Blockquote.extend({ addKeyboardShortcuts: () => ({}) }),
    ],
    content: value,
    editorProps: {
      attributes: { id: 'email-body', class: 'email-body min-h-72 pt-4 pb-2 outline-none' },
      handleKeyDown: (view, e) => {
        const mod = e.metaKey || e.ctrlKey
        // Shared timeline: the app takes ⌘Z when its last action is newer than
        // this editor's typing (see undo.ts).
        if (mod && e.key.toLowerCase() === 'z') {
          return e.shiftKey ? undoBridge.redo(historyDepth(view.state, 'undone')) : undoBridge.undo(currentEditor(), historyDepth(view.state))
        }
        // App-wide shortcuts: stop the editor acting on them (⌘↵ would insert a
        // line break) and let them bubble to the window handler.
        if (mod && (e.key === 'Enter' || (e.shiftKey && e.key === 'Backspace'))) return true
        // ⌘K links the selection (or edits the link you're in); with nothing
        // selected it falls through to the command palette.
        if (mod && e.key.toLowerCase() === 'k' && (!view.state.selection.empty || currentEditor()?.isActive('link'))) {
          e.preventDefault()
          startLinkRef.current()
          return true
        }
        return false
      },
      // ⌘-click opens a link, like most editors.
      handleClick: (view, pos, e) => {
        if (!(e.metaKey || e.ctrlKey)) return false
        const href = view.state.doc.resolve(pos).marks().find((m) => m.type.name === 'link')?.attrs.href
        if (href) window.open(href, '_blank', 'noopener')
        return !!href
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  })

  // Pick up changes made outside the editor: accepted suggestions, restored versions.
  useEffect(() => {
    if (editor && editor.getHTML() !== value) patchContent(editor, value)
  }, [editor, value])

  startLinkRef.current = () => {
    if (!editor) return
    const inLink = editor.isActive('link')
    if (inLink) editor.chain().focus().extendMarkRange('link').run()
    const { from, to, empty } = editor.state.selection
    setLinkDraft({
      from,
      to,
      text: editor.state.doc.textBetween(from, to, ' '),
      url: inLink ? (editor.getAttributes('link').href ?? '') : '',
      isNew: !inLink && empty,
    })
  }

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        blockquote: e.isActive('blockquote'),
        link: e.isActive('link'),
        href: e.getAttributes('link').href as string | undefined,
      },
  })

  if (!editor || !state) return null

  const closeLink = () => {
    setLinkDraft(null)
    editor.commands.focus()
  }

  const applyLink = (draft: LinkDraft) => {
    const href = normaliseUrl(draft.url)
    const text = draft.text.trim() || draft.url.trim()
    if (!href) {
      // Empty URL = remove the link.
      editor.chain().focus().setTextSelection({ from: draft.from, to: draft.to }).unsetLink().run()
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: draft.from, to: draft.to }, { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
        .run()
    }
    setLinkDraft(null)
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 flex h-10 items-center gap-0.5 border-b bg-background">
        <ToolBtn label="Bold" keys="⌘ B" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </ToolBtn>
        <ToolBtn label="Italic" keys="⌘ I" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </ToolBtn>
        <ToolBtn label="Underline" keys="⌘ U" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline />
        </ToolBtn>
        <ToolBtn label="Strikethrough" keys="⌘ ⇧ S" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough />
        </ToolBtn>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <ToolBtn label="Link (select text first)" keys="⌘ K" active={state.link} onClick={() => startLinkRef.current()}>
          <Link2 />
        </ToolBtn>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <ToolBtn label="Bulleted list" keys="⌘ ⇧ 8" active={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List />
        </ToolBtn>
        <ToolBtn label="Numbered list" keys="⌘ ⇧ 7" active={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </ToolBtn>
        <ToolBtn label="Quote" active={state.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <TextQuote />
        </ToolBtn>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <ToolBtn label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting />
        </ToolBtn>
      </div>

      <BubbleMenu
        editor={editor}
        // Show while editing a link, or when the cursor is inside one.
        shouldShow={({ editor: e }) => !!linkDraftRef.current || (e.isActive('link') && e.isFocused)}
        options={{ placement: 'bottom-start', offset: 8 }}
        className="z-30"
      >
        {linkDraft ? (
          <LinkForm draft={linkDraft} onChange={setLinkDraft} onApply={applyLink} onCancel={closeLink} />
        ) : state.href ? (
          <LinkPreview
            href={state.href}
            onEdit={() => startLinkRef.current()}
            onRemove={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          />
        ) : null}
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  )
}

// mailto: for emails, https:// for bare domains, leave anything with a scheme alone.
function normaliseUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ''
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  return `https://${url}`
}

const popover = 'animate-in fade-in-0 zoom-in-95 rounded-lg border bg-popover text-popover-foreground shadow-md'

function LinkPreview({ href, onEdit, onRemove }: { href: string; onEdit: () => void; onRemove: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={cn(popover, 'flex max-w-[360px] items-center gap-0.5 p-1')}>
      <Button variant="ghost" size="sm" asChild className="min-w-0 justify-start font-normal">
        <a href={href} target="_blank" rel="noopener" title="Open link (⌘-click in the text works too)">
          <ExternalLink />
          <span className="truncate">{href.replace(/^(https?:\/\/|mailto:)/, '')}</span>
        </a>
      </Button>
      <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
      <ToolBtn
        label="Copy link"
        onClick={() => {
          navigator.clipboard?.writeText(href).catch(() => {})
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </ToolBtn>
      <ToolBtn label="Edit link" keys="⌘ K" onClick={onEdit}>
        <Pencil />
      </ToolBtn>
      <ToolBtn label="Remove link" onClick={onRemove}>
        <Unlink />
      </ToolBtn>
    </div>
  )
}

function LinkForm({
  draft,
  onChange,
  onApply,
  onCancel,
}: {
  draft: LinkDraft
  onChange: (d: LinkDraft) => void
  onApply: (d: LinkDraft) => void
  onCancel: () => void
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onApply(draft)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }
  const preview = normaliseUrl(draft.url)
  return (
    <div className={cn(popover, 'w-[340px] space-y-3 p-3')} onKeyDown={onKeyDown}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Link to</span>
        <Input autoFocus value={draft.url} onChange={(e) => onChange({ ...draft, url: e.target.value })} placeholder="harbourhackers.com or name@company.com" />
        {preview && preview !== draft.url.trim() && <span className="block truncate text-xs text-muted-foreground">→ {preview}</span>}
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Text</span>
        <Input value={draft.text} onChange={(e) => onChange({ ...draft, text: e.target.value })} placeholder={draft.isNew ? 'Defaults to the address' : ''} />
      </label>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Keys keys="↵" /> save <Keys keys="esc" className="ml-1" /> cancel
        </span>
        <Button size="sm" variant={draft.url.trim() ? 'default' : 'destructive'} onClick={() => onApply(draft)}>
          {draft.url.trim() ? 'Save link' : 'Remove link'}
        </Button>
      </div>
    </div>
  )
}

// Apply an outside change (accepted suggestion, restored version…) by replacing
// only the part of the document that differs. Replacing the whole doc would
// turn the editor's earlier undo steps into no-ops. Kept out of the editor's
// history because the app's undo stack owns these changes.
function patchContent(editor: Editor, html: string) {
  const el = document.createElement('div')
  el.innerHTML = html
  const next = PMDOMParser.fromSchema(editor.schema).parse(el)
  const cur = editor.state.doc
  const start = cur.content.findDiffStart(next.content)
  if (start == null) return
  let { a: endA, b: endB } = cur.content.findDiffEnd(next.content)!
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) {
    endA += overlap
    endB += overlap
  }
  editor.view.dispatch(editor.state.tr.replace(start, endA, next.slice(start, endB)).setMeta('addToHistory', false).setMeta('preventUpdate', true))
}

function ToolBtn({ label, keys, active, onClick, children }: { label: string; keys?: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Hint label={label} keys={keys}>
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size="icon-sm"
        // Keep the text selection: don't let the button steal focus on mousedown.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(!active && 'text-muted-foreground')}
      >
        {children}
      </Button>
    </Hint>
  )
}
