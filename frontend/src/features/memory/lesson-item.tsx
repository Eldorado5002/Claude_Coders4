import { Ban } from 'lucide-react'
import { Link } from 'react-router'
import type { Lesson } from '@/api/types'
import { AutoSeal, DecisionChip, RedactedText, TypeChip } from '@/components/precedent'
import { simTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { lessonReason } from './lessons-view'
import { RevokeDialog } from './revoke-dialog'

/** One lesson in the ledger: who taught what, for which vendor, and whether it still stands. */
export function LessonItem({ lesson: l }: { lesson: Lesson }) {
  return (
    <li className="grid gap-x-6 gap-y-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Link
            to={`/vendors/${l.vendor.id}`}
            className="font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {l.vendor.name}
          </Link>
          <TypeChip type={l.exception_type} />
          <DecisionChip action={l.decision} size="xs" className={cn(l.revoked && 'opacity-60')} />
        </div>

        <blockquote
          className={cn(
            'max-w-[68ch] border-l-2 pl-3 font-serif text-[1.05rem] leading-relaxed text-pretty',
            l.revoked ? 'border-rule text-muted-foreground line-through decoration-reject/70' : 'border-foreground',
          )}
        >
          “<RedactedText text={lessonReason(l)} />”
        </blockquote>

        {l.revoked && (
          <p className="flex items-start gap-2 text-sm text-reject">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-pretty">
              Revoked by {l.revoked_by ?? 'the team'}
              {l.revoke_reason && <>: “{l.revoke_reason}”</>}
            </span>
          </p>
        )}

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {l.auto ? (
            <>
              <AutoSeal />
              <span>taught by Precedent itself</span>
            </>
          ) : (
            <span>taught by {l.taught_by}</span>
          )}
          <span aria-hidden>·</span>
          <time dateTime={l.taught_at} className="tabular-nums">
            {simTime(l.taught_at)}
          </time>
        </p>
      </div>

      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:justify-between">
        <Link
          to={`/exceptions/${l.case_id}`}
          className="font-mono text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
          aria-label={`Open case ${l.case_id}`}
        >
          {l.case_id} →
        </Link>
        {!l.revoked && <RevokeDialog lesson={l} />}
      </div>
    </li>
  )
}
