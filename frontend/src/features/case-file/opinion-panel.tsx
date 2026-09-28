import { Lock, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import { useRecommend } from '@/api/mutations'
import type { ExceptionDetail, Recommendation, ResolveResult } from '@/api/types'
import { AgentMark, Confidence, DecisionChip, Money, SourceChip } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { simTime } from '@/lib/format'
import { ACTION_META } from '@/lib/labels'
import { memoryCount, usableCitations } from '@/lib/citations'
import { enterBelongsToTarget, insideDialogOrForm } from '@/lib/hotkeys'
import { parseRationale } from '@/lib/parse-rationale'
import { firstSentence } from '@/lib/text'
import { Citations, FootnoteMarker, NoPrecedent } from './citations'
import { LessonCard, ResolutionCard } from './outcome'
import { ResolveForm, type Preset } from './resolve-form'
import { ReasoningState, VerdictDiff } from './verdict-parts'

function Verdict({ c, rec, other, memOn }: { c: ExceptionDetail; rec: Recommendation; other?: ExceptionDetail | null; memOn: boolean }) {
  const recommend = useRecommend(c.id)
  const p = parseRationale(
    rec.rationale,
    c.issues.filter((i) => i.blocking).map((i) => i.message),
  )
  const guard = rec.source === 'guardrail'
  const cites = usableCitations(rec.citations)
  const memoryCites = memoryCount(rec.citations)

  return (
    <>
      {guard && p.control && (
        <div className="space-y-2 bg-foreground px-5 py-4 text-background">
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

      <div className="space-y-5 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <DecisionChip action={rec.action} size="lg" />
          <Confidence value={rec.confidence} className="w-24 pt-1" />
        </div>

        {rec.adjusted_amount != null && (
          <p className="text-sm">
            Pay <Money value={rec.adjusted_amount} className="font-semibold" /> instead of{' '}
            <Money value={c.invoice_total} className="text-muted-foreground line-through" />
          </p>
        )}

        {p.body && (
          <p className="font-serif text-[1.15rem] leading-[1.55] text-pretty">
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
        {cites.length > 0 && <Citations cites={cites} />}

        <div className="flex items-center justify-between gap-3 border-t border-rule pt-3 text-[11px] text-muted-foreground">
          <span className="font-mono">
            {rec.provider} · {(rec.latency_ms / 1000).toFixed(1)} s · {simTime(rec.generated_at)}
          </span>
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
export function OpinionPanel({ c, other, memOn = true }: { c: ExceptionDetail; other?: ExceptionDetail | null; memOn?: boolean }) {
  const [form, setForm] = useState<Preset | null>(null)
  const [result, setResult] = useState<ResolveResult | null>(null)
  const rec = c.recommendation
  const writing = c.status === 'open' && !rec
  const canDecide = (c.status === 'open' && !!rec) || c.status === 'auto_resolved'
  const idle = canDecide && !form

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
        <Verdict c={c} rec={rec} other={other} memOn={memOn} />
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
