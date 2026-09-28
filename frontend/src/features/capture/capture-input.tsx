import { ArrowRight, Camera, FileUp, Lock, Upload } from 'lucide-react'
import { useId, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { SAMPLES, type Sample } from './capture-logic'

type Props = {
  onChoose: () => void
  onCamera: () => void
  onSample: (s: Sample) => void
  /** file name of the sample being fetched, if any */
  sampleLoading: string | null
  dragActive: boolean
  dragReject: boolean
}

/** A clearly labelled demo path: the three bundled Balaji invoices, each saying which control it exercises. */
function SamplePicker({ onSample, loading }: { onSample: (s: Sample) => void; loading: string | null }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <p className="text-xs text-muted-foreground">No invoice to hand?</p>
      <div className="border border-rule bg-card">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-3 py-2">
          <span id={labelId} className="text-xs font-semibold tracking-widest uppercase">
            Use a sample invoice
          </span>
          <span className="truncate text-xs text-muted-foreground">Shree Balaji Steel Traders</span>
        </div>
        <ul className="divide-y divide-rule">
          {SAMPLES.map((s) => (
            <li key={s.file}>
              <button
                type="button"
                aria-label={`${s.label} · ${s.shows}`}
                onClick={() => onSample(s)}
                disabled={loading !== null}
                className="group press flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset disabled:opacity-60"
              >
                <img
                  src={s.url}
                  alt=""
                  aria-hidden
                  decoding="async"
                  className="h-11 w-8 shrink-0 border border-rule object-cover object-top"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {s.hard && <Lock className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />}
                    <span className="truncate">{s.shows}</span>
                  </span>
                </span>
                {loading === s.file ? (
                  <Spinner className="size-4 shrink-0" />
                ) : (
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">Capture the freight one twice to see the duplicate control.</p>
    </div>
  )
}

export function CaptureInput({ onChoose, onCamera, onSample, sampleLoading, dragActive, dragReject }: Props) {
  // clicking the empty part of the drop area opens the picker; the buttons inside handle themselves
  const onAreaClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('button')) onChoose()
  }
  return (
    <div className="space-y-6">
      {/* phones: the camera first, big touch targets */}
      <div className="grid gap-3 md:hidden">
        <Button onClick={onCamera} className="h-14 w-full text-sm">
          <Camera className="size-5" data-icon="inline-start" /> Take photo
        </Button>
        <Button variant="outline" onClick={onChoose} className="h-12 w-full">
          <Upload data-icon="inline-start" /> Choose file
        </Button>
        <p className="text-center text-xs text-muted-foreground">JPG, PNG, WEBP or PDF, up to 12 MB</p>
      </div>

      {/* tablets and desktop: a drop area */}
      <div
        onClick={onAreaClick}
        className={cn(
          'hidden min-h-[340px] cursor-pointer flex-col items-center justify-center gap-5 border border-dashed px-8 py-10 text-center transition-colors duration-200 md:flex',
          dragActive && !dragReject && 'border-foreground bg-muted',
          dragReject && 'border-reject bg-reject-soft',
          !dragActive && 'border-rule hover:bg-muted/50',
        )}
      >
        <FileUp className={cn('size-8', dragReject ? 'text-reject' : 'text-muted-foreground')} strokeWidth={1.25} aria-hidden />
        <div className="space-y-1.5">
          <p className="serif-display text-2xl leading-tight">
            {dragReject ? 'That file won’t work.' : dragActive ? 'Drop to capture.' : 'Drop an invoice here'}
          </p>
          <p className="text-sm text-muted-foreground">JPG, PNG, WEBP or PDF, up to 12 MB</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onChoose}>
            <Upload data-icon="inline-start" /> Choose file
          </Button>
          <Button variant="outline" onClick={onCamera}>
            <Camera data-icon="inline-start" /> Take photo
          </Button>
        </div>
      </div>

      <SamplePicker onSample={onSample} loading={sampleLoading} />
    </div>
  )
}
