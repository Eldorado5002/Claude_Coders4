import { Check, Pause } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { AutonomyCertificate } from '@/api/types'
import { AgentMark, Eyebrow } from '@/components/precedent'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  allowance,
  autoRecord,
  boundSentence,
  certificateProgress,
  ladderRows,
  plainPct,
  record,
  sealFor,
  showLadder,
  type Progress,
  type Seg,
  type SealVariant,
} from './trust-view'

const SEAL_STYLE: Record<SealVariant, string> = {
  // the AUTO seal's stamp, inked in: earned
  solid: '-rotate-4 border-foreground bg-foreground text-background',
  // an empty outline: not earned yet
  outline: 'border-foreground/70 text-foreground',
  // the reject tone: auto-pay is off
  reject: 'border-reject bg-reject-soft text-reject',
}

/** CERTIFIED (inked stamp) · COLLECTING (outline) · PAUSED (reject tone). Stamps in when it turns certified. */
export function CertificateSeal({ status, className }: { status: AutonomyCertificate['status']; className?: string }) {
  const seal = sealFor(status)
  // stamp only on the transition into certified, never on first paint
  const [prev, setPrev] = useState(status)
  const [stamp, setStamp] = useState(false)
  if (status !== prev) {
    setPrev(status)
    setStamp(status === 'certified')
  }
  return (
    <span
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 border-[1.5px] px-3 text-sm font-semibold tracking-[0.14em] whitespace-nowrap uppercase [&_svg]:size-2.5',
        SEAL_STYLE[seal.variant],
        stamp && 'animate-stamp',
        className,
      )}
    >
      {seal.variant === 'solid' && <AgentMark />}
      {seal.variant === 'reject' && <Pause className="size-3!" strokeWidth={2.5} aria-hidden />}
      {seal.label}
    </span>
  )
}

/** A sentence whose figures are set in bold. */
function Segs({ segs }: { segs: readonly Seg[] }) {
  return segs.map((s, i) =>
    typeof s === 'string' ? <Fragment key={i}>{s}</Fragment> : <strong key={i} className="font-semibold">{s.b}</strong>,
  )
}

function Ladder({ c }: { c: AutonomyCertificate }) {
  const rows = ladderRows(c)
  return (
    <div className="min-w-0 space-y-2">
      <Eyebrow>By confidence threshold</Eyebrow>
      <Table className="text-xs">
        <caption className="sr-only">
          Verified payment decisions and the {plainPct(c.confidence_level)} upper bound on wrong payments at each confidence
          threshold
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>Confidence</TableHead>
            <TableHead className="text-right">Decisions</TableHead>
            <TableHead className="text-right">Wrong</TableHead>
            <TableHead className="text-right">At most wrong</TableHead>
            <TableHead className="text-center">Certified</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} aria-current={r.current ? 'true' : undefined} className={cn(r.current && 'bg-muted font-medium')}>
              <TableCell className="tabular-nums">
                ≥ {r.threshold}
                {r.current && <span className="ml-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">In force</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.decisions}</TableCell>
              <TableCell className="text-right tabular-nums">{r.errors}</TableCell>
              <TableCell className="text-right tabular-nums">{r.bound}</TableCell>
              <TableCell className="text-center">
                {r.certified ? (
                  <Check className="mx-auto size-3.5" strokeWidth={2.5} aria-label="Certified" />
                ) : (
                  <span className="text-muted-foreground">
                    <span aria-hidden>—</span>
                    <span className="sr-only">Not yet</span>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Certified where the bound is at or under the {plainPct(c.target_error)} target.
      </p>
    </div>
  )
}

function TowardCertification({ p }: { p: Progress }) {
  return (
    <div className="min-w-0 space-y-3">
      <Eyebrow>Toward certification</Eyebrow>
      <p className="serif-display text-[2rem] leading-none">
        {p.have}
        <span className="text-[1.1rem] text-muted-foreground"> of {p.need}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Verified decisions toward certification"
        aria-valuemin={0}
        aria-valuemax={p.need}
        aria-valuenow={p.have}
        aria-valuetext={p.text}
        className="relative h-1 w-full bg-muted"
      >
        <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${Math.min(100, (p.have / p.need) * 100)}%` }} />
      </div>
      <p className="text-xs text-pretty text-muted-foreground">Verified payment decisions needed, if no more are wrong.</p>
    </div>
  )
}

/** The autonomy certificate: whether auto-pay has earned its threshold, and the evidence behind it. */
export function CertificateCard({ c }: { c: AutonomyCertificate }) {
  const progress = certificateProgress(c)
  const ladder = showLadder(c)
  const side = ladder || progress != null

  return (
    <article aria-labelledby="certificate-title" className="@container border border-rule bg-card">
      <div className={cn('grid gap-8 p-5 sm:p-7', side && '@min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] @min-[760px]:gap-10')}>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap-reverse items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 space-y-2">
              <Eyebrow>Autonomy certificate</Eyebrow>
              <h3 id="certificate-title" className="serif-display max-w-xl text-[1.6rem] leading-[1.15] text-balance sm:text-[1.9rem]">
                <Segs segs={allowance(c)} />
              </h3>
            </div>
            <CertificateSeal status={c.status} className="sm:mt-1" />
          </div>

          <ul className="space-y-1.5 text-sm text-pretty">
            <li>
              <Segs segs={record(c)} />
            </li>
            <li>
              <Segs segs={boundSentence(c)} />
            </li>
            <li className="text-muted-foreground">
              <Segs segs={autoRecord(c)} />
            </li>
          </ul>
        </div>

        {side && (
          <div className="min-w-0 space-y-8">
            {progress && <TowardCertification p={progress} />}
            {ladder && <Ladder c={c} />}
          </div>
        )}
      </div>

      {c.explanation && (
        <p className="border-t border-rule px-5 py-4 font-serif text-[1rem] leading-relaxed text-pretty sm:px-7">{c.explanation}</p>
      )}
    </article>
  )
}
