import { format, parseISO } from 'date-fns'
import type { Lesson, RevokeResult } from '@/api/types'
import { TYPE_LABEL } from '@/lib/labels'

const AUTO_PREFIX = /^Auto-resolved under earned autonomy\.\s*/

/** The lesson as a sentence: auto lessons lose the boilerplate the backend prepends. */
export function lessonReason(l: Pick<Lesson, 'reason' | 'auto'>): string {
  return l.auto ? l.reason.replace(AUTO_PREFIX, '') : l.reason
}

export type LessonDay = { day: string; lessons: Lesson[] }

const time = (iso: string) => parseISO(iso).getTime()

/** Lessons grouped by the (local, simulated) day they were taught; newest day and lesson first. */
export function groupByDay(lessons: Lesson[]): LessonDay[] {
  const sorted = [...lessons].sort((a, b) => time(b.taught_at) - time(a.taught_at))
  const days: LessonDay[] = []
  for (const l of sorted) {
    const day = format(parseISO(l.taught_at), 'yyyy-MM-dd')
    const last = days[days.length - 1]
    if (last?.day === day) last.lessons.push(l)
    else days.push({ day, lessons: [l] })
  }
  return days
}

export type LessonStats = { total: number; auto: number; revoked: number }

export function lessonStats(lessons: Lesson[]): LessonStats {
  return {
    total: lessons.length,
    auto: lessons.filter((l) => l.auto).length,
    revoked: lessons.filter((l) => l.revoked).length,
  }
}

export function lessonsHeadline(s: LessonStats): string {
  return `${s.total} ${s.total === 1 ? 'lesson' : 'lessons'} · ${s.auto} taught by the agent itself · ${s.revoked} revoked`
}

export type LessonVendor = { id: string; name: string; count: number }

/** Vendors that have at least one lesson, by name. */
export function lessonVendors(lessons: Lesson[]): LessonVendor[] {
  const byId = new Map<string, LessonVendor>()
  for (const l of lessons) {
    const v = byId.get(l.vendor.id)
    if (v) v.count += 1
    else byId.set(l.vendor.id, { id: l.vendor.id, name: l.vendor.name, count: 1 })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function filterByVendor(lessons: Lesson[], vendorId: string | undefined): Lesson[] {
  return vendorId ? lessons.filter((l) => l.vendor.id === vendorId) : lessons
}

/** null when the reason is acceptable, else what to fix. */
export function checkRevokeReason(reason: string): string | null {
  return reason.trim().length < 5 ? 'Give a reason of at least 5 characters, so the team knows why.' : null
}

/** "Memory deleted · 1 open case will be re-evaluated · trust for Freight reset to suggest" */
export function revokeSummary(r: RevokeResult): string {
  const n = r.invalidated_recommendations
  return [
    r.memory_deleted ? 'Memory deleted' : 'Memory marked revoked',
    `${n} open ${n === 1 ? 'case' : 'cases'} will be re-evaluated`,
    `trust for ${TYPE_LABEL[r.autonomy.exception_type]} reset to ${r.autonomy.level}`,
  ].join(' · ')
}
