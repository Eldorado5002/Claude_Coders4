import { Undo2 } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useRevoke } from '@/api/mutations'
import type { Lesson } from '@/api/types'
import { RedactedText } from '@/components/precedent'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TYPE_LABEL } from '@/lib/labels'
import { useUi } from '@/stores/ui'
import { checkRevokeReason, lessonReason, revokeSummary } from './lessons-view'

/** Take a lesson back: Hindsight forgets it, dependent cases re-run, trust for the lane resets. */
export function RevokeDialog({ lesson }: { lesson: Lesson }) {
  const clerk = useUi((s) => s.clerk)
  const revoke = useRevoke()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const error = checkRevokeReason(reason)
  const fieldId = useId()

  const onOpenChange = (next: boolean) => {
    if (revoke.isPending) return
    setOpen(next)
    if (!next) {
      setReason('')
      setTouched(false)
    }
  }

  const submit = () => {
    setTouched(true)
    if (error) return
    revoke.mutate(
      { caseId: lesson.case_id, reason: reason.trim(), revoked_by: clerk },
      {
        onSuccess: (r) => {
          toast('Lesson revoked', { description: revokeSummary(r) })
          setOpen(false)
          setReason('')
          setTouched(false)
        },
        onError: (e) => toast.error('Lesson not revoked', { description: e.message }),
      },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <Undo2 /> Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-medium tracking-normal normal-case">
              Revoke this lesson?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Precedent deletes this memory from Hindsight, re-evaluates open cases that relied on it, and resets trust for
              this vendor and exception type.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <figure className="space-y-1.5 border-l-2 border-rule pl-3">
            <blockquote className="font-serif text-[0.98rem] leading-relaxed text-pretty">
              “<RedactedText text={lessonReason(lesson)} />”
            </blockquote>
            <figcaption className="text-xs text-muted-foreground">
              {lesson.vendor.name} · {TYPE_LABEL[lesson.exception_type]} · {lesson.case_id}
            </figcaption>
          </figure>

          <div className="space-y-1.5">
            <label htmlFor={fieldId} className="text-xs font-medium">
              Why revoke it?
            </label>
            <Textarea
              id={fieldId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Wrong: freight is capped at ₹5,000 per trip."
              aria-invalid={touched && !!error}
              aria-describedby={touched && error ? `${fieldId}-error` : undefined}
              className="font-serif text-[1rem] leading-relaxed"
            />
            {touched && error && (
              <p id={`${fieldId}-error`} className="text-xs text-reject">
                {error}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">Signed as {clerk}</p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={revoke.isPending}>
              Keep it
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={revoke.isPending}>
              <Undo2 /> {revoke.isPending ? 'Revoking…' : 'Revoke lesson'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
