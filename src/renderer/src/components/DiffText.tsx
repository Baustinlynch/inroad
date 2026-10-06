import { wordDiff } from '../diff'

// Insertions are highlighted like a marker pen; deletions are struck through.
export function DiffText({ a, b }: { a: string; b: string }) {
  return (
    <>
      {wordDiff(a, b).map((part, i) =>
        part.type === 'same' ? (
          <span key={i}>{part.text}</span>
        ) : part.type === 'add' ? (
          <ins key={i} className="mark-soft no-underline">
            {part.text}
          </ins>
        ) : (
          <del key={i} className="text-zinc-400 line-through decoration-zinc-900">
            {part.text}
          </del>
        ),
      )}
    </>
  )
}
