import type { ReactNode } from 'react'

const noteId = (n: number) => `learning-note-${n}`

function jumpTo(n: number) {
  const el = document.getElementById(noteId(n))
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  el.focus({ preventScroll: true })
}

/** Superscript citation that jumps to the numbered footnote at the bottom of the page. */
export function NoteRef({ n }: { n: number | null }) {
  if (n == null) return null
  return (
    <sup className="ml-0.5 align-super text-[0.6em] font-normal tracking-normal">
      <a
        href={`#${noteId(n)}`}
        aria-label={`Note ${n}`}
        className="text-muted-foreground no-underline hover:text-foreground focus-visible:text-foreground"
        onClick={(e) => {
          e.preventDefault()
          jumpTo(n)
        }}
      >
        {n}
      </a>
    </sup>
  )
}

/** "How these numbers are made": the API's assumptions, as numbered footnotes in small serif. */
export function Footnotes({ items }: { items: string[] }): ReactNode {
  return (
    <ol className="max-w-3xl list-decimal space-y-2 pl-5 font-serif text-[0.9rem] leading-relaxed text-pretty text-muted-foreground marker:text-[0.85em] marker:tabular-nums">
      {items.map((a, i) => (
        <li key={i} id={noteId(i + 1)} tabIndex={-1} className="scroll-mt-24 pl-1 outline-none focus-visible:text-foreground">
          {a}
        </li>
      ))}
    </ol>
  )
}
