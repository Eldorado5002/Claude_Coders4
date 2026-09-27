import { EyeOff } from 'lucide-react'
import { splitRedacted } from './redacted'

/** Clerk text with PII redacted by the backend; each redaction becomes a quiet chip. */
export function RedactedText({ text }: { text: string }) {
  return (
    <>
      {splitRedacted(text).map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <span
            key={i}
            className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-sm bg-muted px-1.5 py-px align-middle font-sans text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
          >
            <EyeOff className="size-3" aria-hidden />
            {p.kind.replace('_', ' ')}
          </span>
        ),
      )}
    </>
  )
}
