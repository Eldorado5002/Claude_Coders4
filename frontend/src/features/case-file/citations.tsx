import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import type { Citation } from '@/api/types'
import { KindBadge, RedactedText, Section } from '@/components/precedent'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { simDay } from '@/lib/format'

/** ¹ — a footnote marker in the opinion, with the cited memory on hover. */
export function FootnoteMarker({ n, cite }: { n: number; cite: Citation }) {
  return (
    <HoverCard openDelay={80} closeDelay={60}>
      <HoverCardTrigger asChild>
        <a
          href={`#cite-${n}`}
          className="ml-0.5 align-super font-sans text-[0.62em] font-semibold text-muted-foreground no-underline outline-none hover:text-foreground focus-visible:text-foreground"
          aria-label={`Precedent ${n}`}
        >
          {n}
        </a>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <KindBadge kind={cite.kind} />
          {cite.occurred_at && <span className="text-[11px] text-muted-foreground">{simDay(cite.occurred_at)}</span>}
        </div>
        <p className="text-sm text-pretty">
          <RedactedText text={cite.text} />
        </p>
      </HoverCardContent>
    </HoverCard>
  )
}

export function Citations({ cites }: { cites: Citation[] }) {
  return (
    <Section title="Precedents cited" aside={`${cites.length} from Hindsight memory`}>
      <ol className="space-y-4">
        {cites.map((c, i) => (
          <li key={c.id} id={`cite-${i + 1}`} className="grid scroll-mt-6 grid-cols-[1.25rem_1fr] gap-x-2">
            <span className="serif-display pt-0.5 text-lg leading-none text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <KindBadge kind={c.kind} />
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {c.occurred_at && simDay(c.occurred_at)}
                  {c.exception_id && (
                    <Link to={`/exceptions/${c.exception_id}`} className="font-mono underline-offset-2 hover:text-foreground hover:underline">
                      {c.exception_id} →
                    </Link>
                  )}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-pretty">
                <RedactedText text={c.text} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** Day 1: memory was searched and nothing applied — say so plainly. */
export function NoPrecedent({ vendor, memoryOn }: { vendor: string; memoryOn: boolean }) {
  return (
    <div className="flex gap-3 border border-dashed border-rule px-4 py-3 text-sm text-muted-foreground">
      <SearchX className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-pretty">
        {memoryOn ? (
          <>
            Precedent searched {vendor}’s history and this exception type and found nothing that applies yet. Your
            decision becomes the first precedent.
          </>
        ) : (
          <>Memory is off, so Precedent is judging from the documents alone, like a stateless assistant.</>
        )}
      </p>
    </div>
  )
}
