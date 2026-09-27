import { ArrowRight, Camera, FileUp, Upload } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { SAMPLE_URL } from './capture-logic'

type Props = {
  onChoose: () => void
  onCamera: () => void
  onSample: () => void
  sampleLoading: boolean
  dragActive: boolean
  dragReject: boolean
}

/** A clearly labelled demo path: loads the bundled Balaji invoice and captures it. */
function SampleButton({ onSample, loading }: { onSample: () => void; loading: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">No invoice to hand?</p>
      <button
        type="button"
        onClick={onSample}
        disabled={loading}
        className="group press flex w-full items-center gap-4 border border-rule bg-card px-3 py-3 text-left transition-colors duration-150 outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
      >
        <img
          src={SAMPLE_URL}
          alt=""
          aria-hidden
          className="h-14 w-11 shrink-0 border border-rule object-cover object-top"
        />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-xs font-semibold tracking-widest uppercase">Use sample invoice</span>
          <span className="block truncate text-xs text-muted-foreground">Shree Balaji Steel Traders · steel plate and freight</span>
        </span>
        {loading ? (
          <Spinner className="size-4 shrink-0" />
        ) : (
          <ArrowRight
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </button>
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

      <SampleButton onSample={onSample} loading={sampleLoading} />
    </div>
  )
}
