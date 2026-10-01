import { useEffect, useRef } from 'react'
import { useSonner } from 'sonner'
import { playChime, unlockAudioOnFirstGesture } from '@/lib/sound'

type Id = string | number

/** Ids not seen before. An updated notification keeps its id, so it doesn't chime twice. */
export function newToastIds(ids: Id[], seen: Set<Id>): Id[] {
  const fresh = ids.filter((id) => !seen.has(id))
  for (const id of fresh) seen.add(id)
  return fresh
}

/** Mount once in the shell: every new notification plays the chime. */
export function useToastChime() {
  const { toasts } = useSonner()
  const seen = useRef(new Set<Id>())
  useEffect(() => unlockAudioOnFirstGesture(), [])
  useEffect(() => {
    if (newToastIds(toasts.map((t) => t.id), seen.current).length > 0) playChime()
  }, [toasts])
}
