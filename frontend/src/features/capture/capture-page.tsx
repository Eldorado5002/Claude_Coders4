import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useDropzone } from 'react-dropzone'
import { ApiError } from '@/api/client'
import { useCapture } from '@/api/mutations'
import { PageHeader } from '@/components/precedent'
import { CaptureInput } from './capture-input'
import {
  ACCEPT,
  MAX_BYTES,
  SAMPLE_NAME,
  SAMPLE_URL,
  captureErrorView,
  captureOutcome,
  rejectionSummary,
  validateFile,
} from './capture-logic'
import { CapturePreview, ProcessingSteps } from './capture-preview'
import { CaptureResultView } from './capture-result'
import { CaptureErrorPanel, RejectionNotice, WhatHappens } from './capture-states'
import { useObjectUrl } from './use-object-url'

type Notice = { name: string | null; reasons: string[] }

export default function CapturePage() {
  const capture = useCapture()
  const [file, setFile] = useState<File | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [previewUrl, setPreviewFile] = useObjectUrl()
  const cameraRef = useRef<HTMLInputElement>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)
  const pending = capture.isPending

  const submit = (f: File) => {
    setNotice(null)
    setFile(f)
    setPreviewFile(f)
    capture.mutate(f)
  }

  const reset = () => {
    capture.reset()
    setFile(null)
    setPreviewFile(null)
    setNotice(null)
    document.getElementById('main')?.scrollTo({ top: 0 })
  }

  const dz = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: false,
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
    disabled: pending || sampleLoading,
    onDropAccepted: (files) => {
      if (files[0]) submit(files[0])
    },
    onDropRejected: (rejections) => setNotice(rejectionSummary(rejections)),
  })

  // the camera input bypasses the dropzone, so it gets the same checks here
  const onCameraChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const problem = validateFile(f)
    if (problem) setNotice({ name: f.name, reasons: [problem] })
    else submit(f)
  }

  const loadSample = async () => {
    setNotice(null)
    setSampleLoading(true)
    try {
      const res = await fetch(SAMPLE_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      submit(new File([blob], SAMPLE_NAME, { type: blob.type || 'image/png' }))
    } catch {
      setNotice({ name: null, reasons: ['Couldn’t load the sample invoice. Choose a file instead.'] })
    } finally {
      setSampleLoading(false)
    }
  }

  // phones stack the result under the photo: bring the answer into view when it lands
  useEffect(() => {
    if (capture.status !== 'success' && capture.status !== 'error') return
    if (!window.matchMedia?.('(max-width: 1023px)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    outcomeRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [capture.status])

  const errorView = capture.isError ? captureErrorView(capture.error) : null
  const announce = pending ? 'Reading the invoice.' : capture.data ? captureOutcome(capture.data).title : ''

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
      <PageHeader
        eyebrow="Capture"
        title="Snap an invoice. Precedent does the rest."
        description="Gemini reads it, the 3-way match runs, and Precedent opens a case if anything is off."
      />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        {/* input, then the page being read */}
        <div {...dz.getRootProps({ className: 'relative min-w-0 space-y-4 self-start lg:sticky lg:top-8' })}>
          <input {...dz.getInputProps({ 'aria-label': 'Choose an invoice file' })} />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={onCameraChange}
          />
          {file ? (
            <CapturePreview file={file} url={previewUrl} scanning={pending} />
          ) : (
            <CaptureInput
              onChoose={dz.open}
              onCamera={() => cameraRef.current?.click()}
              onSample={() => void loadSample()}
              sampleLoading={sampleLoading}
              dragActive={dz.isDragActive}
              dragReject={dz.isDragReject}
            />
          )}
          {notice && <RejectionNotice name={notice.name} reasons={notice.reasons} />}
          {file && dz.isDragActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border border-dashed border-foreground bg-background/90">
              <p className="serif-display text-2xl">{dz.isDragReject ? 'That file won’t work.' : 'Drop to capture another.'}</p>
            </div>
          )}
        </div>

        {/* what happened */}
        <div ref={outcomeRef} className="min-w-0 scroll-mt-4">
          {pending ? (
            <ProcessingSteps />
          ) : capture.isSuccess ? (
            <CaptureResultView result={capture.data} onReset={reset} />
          ) : errorView ? (
            <CaptureErrorPanel
              view={errorView}
              unreachable={capture.error instanceof ApiError && capture.error.status === 0}
              onRetry={() => file && capture.mutate(file)}
              onReset={reset}
            />
          ) : (
            <WhatHappens className="hidden lg:block" />
          )}
        </div>
      </div>
    </div>
  )
}
