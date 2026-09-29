import { Lock, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useChangeCount } from '@/hooks/use-change-count'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import { useRecommend } from '@/api/mutations'
import type { ExceptionDetail, Recommendation, ResolveResult } from '@/api/types'
import { AgentMark, Confidence, DecisionChip, Money, SourceChip } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ACTION_META } from '@/lib/labels'
import { memoryCount, usableCitations } from '@/lib/citations'
import { enterBelongsToTarget, insideDialogOrForm } from '@/lib/hotkeys'
import { parseRationale } from '@/lib/parse-rationale'
import { firstSentence } from '@/lib/text'
import { cn } from '@/lib/utils'
import { Citations, FootnoteMarker, NoPrecedent } from './citations'
import { calibratedCopy, opinionMeta } from './opinion-meta'
import { LessonCard, ResolutionCard } from './outcome'
import { ResolveForm, type Preset } from './resolve-form'
import { ReasoningState, Rerunning, VerdictDiff } from './verdict-parts'

const AFTER = (ms: number) => ({ animationDelay: `${ms}ms` })

/**
 * `enter`: the verdict just arrived while the reader watched it being written. A verdict that changes in place
 * (memory switched) animates the same way; one already written when the case opens simply shows.
 */
function Verdict({
  c,
  rec,
  other,
  memOn,
  enter = false,
}: {
  c: ExceptionDetail
  rec: Recommendation
  other?: ExceptionDetail | null
  memOn: boolean
  enter?: boolean
}) {
  const recommend = useRecommend(c.id)
  const changes = useChangeCount(`${rec.action}|${rec.confidence}|${rec.generated_at}`)
  const live = enter || changes > 0
  const p = parseRationale(
    rec.rationale,
    c.issues.filter((i) => i.blocking).map((i) => i.message),
  )
  const guard = rec.source === 'guardrail'
  const cites = usableCitations(rec.citations)
  const memoryCites = memoryCount(rec.citations)
  const calibrated = calibratedCopy(rec.calibrated_confidence)
  const meta = opinionMeta(rec)

  return (
    <>
      {guard && p.control && (
        <div className={cn('space-y-2 bg-foreground px-5 py-4 text-background', live && 'animate-rise')}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
            <Lock className="size-3.5" strokeWidth={2.5} /> Hard control
          </div>
          <p className="text-sm leading-relaxed text-pretty">{p.control.message}</p>
          {p.control.forced && (
            <p className="text-sm">
              Action forced to <span className="font-semibold">{ACTION_META[p.control.forced].label.toLowerCase()}</span>.
            </p>
          )}
          {p.memoryWouldHave && (
            <p className="border-t border-background/20 pt-2 font-serif text-[1.05rem]">
              Memory alone would have said <s className="decoration-2">{ACTION_META[p.memoryWouldHave].label}</s>. Controls
              never bend to what the agent has learned.
            </p>
          )}
        </div>
      )}

      <div className="space-y-5 px-5 py-5" data-enter={live || undefined}>
        <div className="flex items-start justify-between gap-4">
          {/* a new decision replaces the old one; the score and meter beside it morph instead of remounting */}
          <DecisionChip key={rec.action} action={rec.action} size="lg" className={cn(live && 'animate-rise')} />
          <div className="w-36 space-y-1.5 pt-1">
            <Confidence value={rec.confidence} className="w-full" animated />
            {calibrated && <p className="text-[11px] leading-snug text-pretty text-muted-foreground">{calibrated}</p>}
          </div>
        </div>

        {rec.adjusted_amount != null && (
          <p className="text-sm">
            Pay <Money value={rec.adjusted_amount} className="font-semibold" /> instead of{' '}
            <Money value={c.invoice_total} className="text-muted-foreground line-through" />
          </p>
        )}

        {p.body && (
          <p
            key={`body-${changes}`}
            className={cn('font-serif text-[1.15rem] leading-[1.55] text-pretty', live && 'animate-rise')}
            style={live ? AFTER(60) : undefined}
          >
            {p.body}
            {cites.map((ct, i) => (
              <span key={ct.id}>
                {i > 0 && <span className="align-super font-sans text-[0.62em] text-muted-foreground">,</span>}
                <FootnoteMarker n={i + 1} cite={ct} />
              </span>
            ))}
          </p>
        )}

        {p.ml && (
          <p className="border-l-2 border-hold pl-3 text-sm text-pretty">
            <span className="font-semibold">Unusual for this vendor.</span> {p.ml.charAt(0).toUpperCase() + p.ml.slice(1)}
          </p>
        )}

        <VerdictDiff c={c} other={other} memOn={memOn} />

        {memoryCites === 0 && !guard && <NoPrecedent vendor={c.vendor.name} memoryOn={memOn} />}
        {cites.length > 0 && <Citations key={`cites-${changes}`} cites={cites} enter={live} after={120} />}

        <div className="flex items-center justify-between gap-3 border-t border-rule pt-3 text-[11px] text-muted-foreground">
          <div className="min-w-0 space-y-0.5">
            <p className="tabular-nums">
              {meta.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span aria-hidden className="mx-1 text-muted-foreground/60">·</span>}
                  <span className={cn(i === 0 && rec.route && 'font-medium text-foreground')}>{part}</span>
                </span>
              ))}
            </p>
            <p className="truncate font-mono" title={rec.provider}>
              {rec.provider}
            </p>
          </div>
          {c.status === 'open' && (
            <Button
              variant="ghost"
              size="xs"
              className="normal-case tracking-normal"
              disabled={recommend.isPending}
              onClick={() => recommend.mutate(undefined, { onError: (e) => toast.error('Re-run failed', { description: e.message }) })}
            >
              <RefreshCw className={recommend.isPending ? 'animate-spin' : undefined} /> Re-run
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

/** Precedent's opinion + the human decision flow. */
export function OpinionPanel({
  c,
  other,
  memOn = true,
  rerunning = false,
}: {
  c: ExceptionDetail
  other?: ExceptionDetail | null
  memOn?: boolean
  /** memory was just switched: `c` is the previous verdict, shown dimmed until the new one lands */
  rerunning?: boolean
}) {
  const [form, setForm] = useState<Preset | null>(null)
  const [result, setResult] = useState<ResolveResult | null>(null)
  const rec = c.recommendation
  const writing = c.status === 'open' && !rec
  const canDecide = (c.status === 'open' && !!rec) || c.status === 'auto_resolved'
  const idle = canDecide && !form && !rerunning
  // a verdict that lands while the reader watches it being written rises in. Keeping the previous state in state
  // (React's pattern for adjusting on a prop change) keeps the render pure.
  const [wasWriting, setWasWriting] = useState(writing)
  const [arrived, setArrived] = useState(false)
  if (wasWriting !== writing) {
    setWasWriting(writing)
    if (!writing && rec) setArrived(true)
  }

  const accept = () =>
    rec &&
    setForm({
      decision: rec.action,
      reason: rec.source === 'guardrail' ? '' : firstSentence(parseRationale(rec.rationale).body || rec.rationale),
      adjusted: rec.adjusted_amount != null ? String(rec.adjusted_amount) : '',
    })
  const letter = { enabled: idle, preventDefault: true, ignoreEventWhen: insideDialogOrForm }
  useHotkeys(
    'enter',
    accept,
    { enabled: idle && c.status === 'open', preventDefault: true, ignoreEventWhen: enterBelongsToTarget },
    [rec, idle],
  )
  useHotkeys('o', () => setForm({ decision: null, reason: '' }), letter, [idle])
  useHotkeys('h', () => setForm({ decision: 'hold', reason: '' }), letter, [idle])
  useHotkeys('e', () => setForm({ decision: 'escalate', reason: '' }), letter, [idle])

  return (
    <section aria-label="Precedent’s opinion" className="border border-rule bg-card shadow-[0_1px_0_0_var(--rule)]">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <AgentMark /> Precedent’s opinion
        </h2>
        {rec && <SourceChip source={rec.source} count={memoryCount(rec.citations)} />}
      </header>

      {writing ? (
        <ReasoningState vendor={c.vendor.name} />
      ) : rec ? (
        <>
          {rerunning && <Rerunning memOn={memOn} />}
          <div
            aria-busy={rerunning || undefined}
            className={cn('transition-opacity duration-200 ease-out', rerunning && 'pointer-events-none opacity-45')}
          >
            <Verdict c={c} rec={rec} other={other} memOn={memOn} enter={arrived} />
          </div>
        </>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">No opinion was recorded for this case.</p>
      )}

      {idle && c.status === 'open' && rec && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule bg-muted/40 px-5 py-4">
          <Button onClick={accept} className="press">
            Accept · {ACTION_META[rec.action].label}
            <Kbd className="ml-1 bg-background/20 text-current">↵</Kbd>
          </Button>
          <Button variant="outline" onClick={() => setForm({ decision: null, reason: '' })} className="press">
            Overrule <Kbd className="ml-1">O</Kbd>
          </Button>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setForm({ decision: 'hold', reason: '' })}>
              Hold <Kbd className="ml-1">H</Kbd>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setForm({ decision: 'escalate', reason: '' })}>
              Escalate <Kbd className="ml-1">E</Kbd>
            </Button>
          </div>
        </div>
      )}

      {form && (
        <ResolveForm
          c={c}
          preset={form}
          onCancel={() => setForm(null)}
          onDone={(r) => {
            setResult(r)
            setForm(null)
          }}
        />
      )}

      {(c.status === 'resolved' || c.status === 'auto_resolved') && <ResolutionCard c={c} />}
      {c.status === 'auto_resolved' && !form && (
        <div className="border-t border-rule px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setForm({ decision: null, reason: '' })}>
            Override Precedent’s decision
          </Button>
        </div>
      )}
      {result && <LessonCard result={result} />}
    </section>
  )
}
