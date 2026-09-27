import { Check, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AgentMark, Mono } from '@/components/precedent'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { PROCESS_STEPS, formatBytes, isPdf, stepAt } from './capture-logic'

const SCAN_KEYFRAMES = `@keyframes capture-scan {
  0% { transform: translateY(-100%); opacity: 0 }
  8% { opacity: 1 }
  92% { opacity: 1 }
  100% { transform: translateY(0); opacity: 0 }
}`

/** A thin ink line sweeping top to bottom over the page. Hidden under reduced motion (a spinner shows instead). */
function ScanLine() {
  return (
    <>
      <style>{SCAN_KEYFRAMES}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-foreground/[0.035] [animation:capture-scan_2.4s_var(--ease-in-out)_infinite] motion-reduce:hidden"
      >
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" />
      </div>
    </>
  )
}

/** The captured page: image thumbnail or, for a PDF, a document card. Scans while `scanning`. */
export function CapturePreview({ file, url, scanning }: { file: File; url: string | null; scanning: boolean }) {
  const pdf = isPdf(file)
  return (
    <figure className="space-y-2.5">
      <div className="relative flex justify-center border border-rule bg-muted/60 p-3 md:p-5">
        <div className={cn('relative w-fit max-w-full overflow-hidden border border-rule bg-card', scanning && 'motion-reduce:opacity-60')}>
          {pdf ? (
            <div className="flex aspect-[3/4] w-44 flex-col items-center justify-center gap-3 px-4 text-center md:w-56">
              <FileText className="size-10 text-muted-foreground" strokeWidth={1.25} aria-hidden />
              <Mono className="line-clamp-3 text-xs break-all">{file.name}</Mono>
            </div>
          ) : url ? (
            <img
              src={url}
              alt={`The invoice you captured: ${file.name}`}
              className="block max-h-[40vh] w-auto max-w-full lg:max-h-[min(68vh,660px)]"
            />
          ) : (
            <Skeleton className="aspect-[3/4] w-44 md:w-56" />
          )}
          {scanning && <ScanLine />}
        </div>
        {scanning && (
          <div className="absolute inset-0 hidden items-center justify-center motion-reduce:flex">
            <Spinner className="size-7" />
          </div>
        )}
      </div>
      <figcaption className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <Mono className="min-w-0 truncate">{file.name}</Mono>
        <span className="shrink-0 tabular-nums">{formatBytes(file.size)}</span>
      </figcaption>
    </figure>
  )
}

/** Timed captions while the capture request runs, in the agent's voice. */
export function ProcessingSteps() {
  const [at, setAt] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    const t = window.setInterval(() => setAt(stepAt(performance.now() - t0)), 250)
    return () => window.clearInterval(t)
  }, [])
  return (
    <section className="space-y-5" aria-busy="true">
      <div className="space-y-4 border-t border-foreground pt-5">
        <ol className="space-y-2.5">
          {PROCESS_STEPS.map((s, i) => (
            <li
              key={s.label}
              className={cn(
                'flex items-center gap-2.5 font-serif text-[1.05rem] transition-opacity duration-300',
                i > at && 'opacity-35',
                i < at && 'text-muted-foreground',
              )}
            >
              {i < at ? (
                <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              ) : (
                <AgentMark className={cn(i === at && 'animate-pulse')} />
              )}
              {s.label}
            </li>
          ))}
        </ol>
        <div className="writing-rule" aria-hidden />
        <p className="text-xs text-muted-foreground">This can take several seconds on a phone photo.</p>
      </div>
      {/* the shape of what's coming, desktop only */}
      <div className="hidden space-y-3 lg:block" aria-hidden>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </section>
  )
}
