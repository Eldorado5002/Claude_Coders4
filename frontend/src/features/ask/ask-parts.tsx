import { ArrowUp, Building2, CircleAlert, CornerDownLeft, RotateCcw, X } from 'lucide-react'
import type { KeyboardEvent, Ref } from 'react'
import { AgentMark, Eyebrow, Markdown, Mono } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { Citations, FootnoteMarker } from '@/features/case-file/citations'
import { answeredIn, type Turn } from './ask-model'

/** "Asking about Shree Balaji Steel Traders Pvt Ltd ×" */
export function ScopeChip({ id, name, onRemove }: { id: string; name?: string; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 pt-2 text-xs text-muted-foreground">
      <span className="shrink-0">Asking about</span>
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-rule bg-muted/60 py-0.5 pr-0.5 pl-2 text-foreground">
        <Building2 className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate font-medium">{name ?? <Mono>{id}</Mono>}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Ask across all vendors"
          title="Ask across all vendors"
          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <X className="size-3" aria-hidden />
        </button>
      </span>
    </div>
  )
}

/** Before anything is asked: three questions worth asking. */
export function Suggestions({
  items,
  about,
  onPick,
}: {
  items: string[]
  about?: string
  onPick: (q: string) => void
}) {
  return (
    <div className="space-y-6">
      <p className="serif-display text-[1.45rem] leading-snug text-balance">
        {about ? `Ask what the team has decided about ${about}.` : 'Ask what the team has decided before.'}
      </p>
      <div className="space-y-1">
        <Eyebrow>Try asking</Eyebrow>
        <ul className="divide-y divide-rule border-y border-rule">
          {items.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onPick(q)}
                className="group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 px-2 py-3 text-left font-serif text-[1.02rem] leading-snug text-pretty outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span>{q}</span>
                <CornerDownLeft
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Pending() {
  return (
    <div className="space-y-3 pt-1">
      <p className="flex items-center gap-2 font-serif text-[1.05rem]">
        <AgentMark />
        Reflecting on memory…
      </p>
      <div className="writing-rule" aria-hidden />
      <p className="text-xs text-muted-foreground">Hindsight reads back through the team’s decisions. This can take a few seconds.</p>
    </div>
  )
}

function Failed({ error, onRetry, busy }: { error: string; onRetry: () => void; busy: boolean }) {
  return (
    <div className="flex gap-3 border border-dashed border-rule px-4 py-3">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 space-y-2.5">
        <p className="text-sm text-pretty">{error}</p>
        <Button variant="outline" size="xs" onClick={onRetry} disabled={busy}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </div>
  )
}

function Answer({ t }: { t: Turn }) {
  const cites = t.citations ?? []
  const text = t.answer?.trim()
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <AgentMark className="text-foreground" /> Precedent
        </div>
        {text ? (
          // The last paragraph runs inline so the footnote markers sit at the end of the answer, as in an opinion.
          <div className="font-serif text-[1.0625rem] leading-[1.6] [&_.prose-case]:inline [&_.prose-case>p:last-child]:inline">
            <Markdown>{text}</Markdown>
            {cites.map((c, i) => (
              <FootnoteMarker key={c.id} n={i + 1} cite={c} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No answer came back.</p>
        )}
      </div>
      {cites.length > 0 ? (
        <Citations cites={cites} />
      ) : (
        <p className="border border-dashed border-rule px-3 py-2 text-xs text-muted-foreground">
          No precedents cited. Nothing in memory backs this answer.
        </p>
      )}
      {t.latency_ms != null && <p className="text-xs text-muted-foreground">{answeredIn(t.latency_ms)}</p>}
    </div>
  )
}

/** One question and what came back. */
export function TurnView({ t, busy, onRetry }: { t: Turn; busy: boolean; onRetry: () => void }) {
  return (
    <li data-turn={t.id} className="animate-rise space-y-4 py-6 first:pt-0 last:pb-2">
      <p className="text-[15px] leading-snug font-medium text-pretty whitespace-pre-line">{t.question}</p>
      {t.status === 'pending' && <Pending />}
      {t.status === 'failed' && <Failed error={t.error ?? 'Something went wrong.'} onRetry={onRetry} busy={busy} />}
      {t.status === 'answered' && <Answer t={t} />}
    </li>
  )
}

export function Composer({
  value,
  onChange,
  onSend,
  canSend,
  disabled,
  placeholder,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  canSend: boolean
  disabled: boolean
  placeholder: string
  inputRef: Ref<HTMLTextAreaElement>
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (canSend) onSend()
  }
  return (
    <form
      className="border-t border-rule px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSend()
      }}
    >
      <div className="flex items-end gap-3">
        <Textarea
          ref={inputRef}
          aria-label="Your question"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          enterKeyHint="send"
          rows={1}
          className="max-h-40 min-h-11 py-2.5"
        />
        <Button type="submit" size="icon-sm" disabled={!canSend} aria-label="Ask" className="mb-1 press">
          <ArrowUp aria-hidden />
        </Button>
      </div>
      <p className="mt-2 hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
        <Kbd>↵</Kbd> to ask <span aria-hidden>·</span> <Kbd>Shift</Kbd> <Kbd>↵</Kbd> for a new line
      </p>
    </form>
  )
}
