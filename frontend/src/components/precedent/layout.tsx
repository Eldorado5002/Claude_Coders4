import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Eyebrow } from './text'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6', className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="serif-display text-[2.4rem] leading-[1.05] font-medium text-balance">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A titled block separated by a hairline rule. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
        <Eyebrow>{title}</Eyebrow>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-8 py-16 text-center', className)}>
      {icon && <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="serif-display max-w-md text-2xl leading-tight text-balance">{title}</p>
      {children && <div className="max-w-md text-sm text-pretty text-muted-foreground">{children}</div>}
      {action}
    </div>
  )
}
