import { BookOpen, CornerDownRight, FileText, Layers, Scale, type LucideIcon } from 'lucide-react'
import type { CitationKind } from '@/api/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { KIND_META } from '@/lib/labels'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<CitationKind, LucideIcon> = {
  observation: Layers,
  world: FileText,
  experience: CornerDownRight,
  mental_model: BookOpen,
  directive: Scale,
}

/** Memory kind with a plain-language tooltip (definitions from Hindsight's docs). */
export function KindBadge({ kind, className }: { kind: CitationKind; className?: string }) {
  const Icon = KIND_ICON[kind]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'inline-flex cursor-help items-center gap-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase outline-none focus-visible:text-foreground',
            className,
          )}
        >
          <Icon className="size-3" strokeWidth={2.25} aria-hidden />
          {KIND_META[kind].label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{KIND_META[kind].tip}</TooltipContent>
    </Tooltip>
  )
}
