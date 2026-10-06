// Email bodies are stored as HTML (what the editor edits and what goes into the
// IMAP draft). Plain text is derived for diffs and for the voice-learning step.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Drafts come from the model as lightweight markdown: **bold**, *italic*, [text](url).
export function textToHtml(text: string): string {
  if (!text.trim()) return ''
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const inline = escape(para)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\n/g, '<br>')
      return `<p>${inline}</p>`
    })
    .join('')
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  const blocks: string[] = []
  doc.body.childNodes.forEach((n) => {
    if (n instanceof HTMLElement && (n.tagName === 'UL' || n.tagName === 'OL')) {
      const ordered = n.tagName === 'OL'
      blocks.push([...n.querySelectorAll('li')].map((li, i) => `${ordered ? `${i + 1}.` : '-'} ${li.textContent?.trim()}`).join('\n'))
    } else {
      blocks.push(n.textContent ?? '')
    }
  })
  return blocks.join('\n\n')
}

// Claude quotes the email as plain text (see htmlToText), so suggested edits
// are matched against the HTML by escaping them the same way the editor does.
// Text that spans formatting (e.g. half a bold phrase) won't match; callers
// treat that as "the text has changed".
const asHtml = (text: string) => escape(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')

export const htmlHasText = (html: string, text: string) => html.includes(asHtml(text))

export const replaceText = (html: string, from: string, to: string) => html.replace(asHtml(from), () => asHtml(to))
