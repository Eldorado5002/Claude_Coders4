import { cn } from '@/lib/utils'

/** ◆ — the agent's mark. Anything Precedent wrote carries it. Drawn, not typed, so it looks the same in every font. */
export function AgentMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 10 10"
      className={cn('inline-block size-[0.62em] shrink-0 align-[0.02em]', className)}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor" />
    </svg>
  )
}
