import { useEffect, useRef, useState, type ComponentProps, type PointerEvent, type ReactElement, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCanHover } from '@/hooks/use-can-hover'

const OPEN_DELAY = 120
const CLOSE_DELAY = 100

/**
 * A figure that explains itself, for every way of reaching it: hover with a mouse, tap on touch, Enter from the
 * keyboard. One popover, so the content is always focusable and its links reachable (a hover card or tooltip is
 * neither). Opened by hover it keeps focus where it was and closes when the mouse leaves; a click pins it open.
 */
export function InfoPop({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
}: {
  /** a button (or any focusable element) */
  trigger: ReactElement
  children: ReactNode
  align?: ComponentProps<typeof PopoverContent>['align']
  side?: ComponentProps<typeof PopoverContent>['side']
  className?: string
}) {
  const canHover = useCanHover()
  const [open, setOpen] = useState(false)
  const byHover = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const cancel = () => window.clearTimeout(timer.current)
  useEffect(() => cancel, [])

  const openSoon = (e: PointerEvent) => {
    if (!canHover || e.pointerType !== 'mouse' || open) return
    cancel()
    timer.current = window.setTimeout(() => {
      byHover.current = true
      setOpen(true)
    }, OPEN_DELAY)
  }
  const closeSoon = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    cancel()
    if (byHover.current) timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancel()
        byHover.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger
        asChild
        onPointerEnter={openSoon}
        onPointerLeave={closeSoon}
        onClick={(e) => {
          // hover already opened it: the click pins it instead of closing it
          if (open && byHover.current) {
            e.preventDefault()
            cancel()
            byHover.current = false
          }
        }}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className={className}
        onPointerEnter={cancel}
        onPointerLeave={closeSoon}
        // a mouse passing over shouldn't move keyboard focus; Enter or a tap should
        onOpenAutoFocus={(e) => byHover.current && e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
