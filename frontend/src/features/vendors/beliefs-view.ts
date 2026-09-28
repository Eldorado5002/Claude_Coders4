import { parseISO } from 'date-fns'
import { ApiError } from '@/api/client'
import type { Belief, BeliefVersion } from '@/api/types'
import { simDay } from '@/lib/format'

const DAY = /^(\d{4}-\d{2}-\d{2})(?:$|T)/

/**
 * The calendar day of an ISO timestamp ("2026-03-12T12:30:00.010000Z" → "2026-03-12").
 * Hindsight stamps beliefs in UTC on the simulated clock; the day is what matters, so we never shift zones.
 */
export function isoDay(iso: string | null | undefined): string | null {
  return iso?.match(DAY)?.[1] ?? null
}

const stamp = (v: BeliefVersion) => {
  if (!isoDay(v.as_of)) return null
  const t = parseISO(v.as_of!).getTime()
  return Number.isNaN(t) ? null : t
}

/** Versions oldest first. Undated ones can't be placed, so they lead, in the order the server sent them. */
export function orderVersions(versions: BeliefVersion[]): BeliefVersion[] {
  return versions
    .map((v, i) => ({ v, i, t: stamp(v) }))
    .sort((a, b) => {
      if (a.t === null || b.t === null) return a.t === b.t ? a.i - b.i : a.t === null ? -1 : 1
      return a.t - b.t || a.i - b.i
    })
    .map((x) => x.v)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const versionsLabel = (k: number) => `How this belief changed (${plural(k, 'version', 'versions')})`

export const memoriesLabel = (n: number) => plural(n, 'memory', 'memories')

export const revisedByLabel = (n: number) => `Revised by ${plural(n, 'new memory', 'new memories')}`

/** The section's own quiet note: beliefs come through Hindsight, which can be down while the rest works. */
export function beliefsErrorCopy(e: unknown): string {
  if (e instanceof ApiError && e.status === 503) return 'Hindsight isn’t answering, so beliefs can’t be shown right now.'
  if (e instanceof ApiError && e.status === 0) return 'Can’t reach the Precedent API.'
  return 'Beliefs didn’t load.'
}

/** "2 Mar", "22 Apr". Last updated is dropped when it's the same day the belief first formed. */
export function beliefDates(b: Pick<Belief, 'first_seen' | 'last_updated'>): {
  firstSeen: string | null
  lastUpdated: string | null
} {
  const first = isoDay(b.first_seen)
  const last = isoDay(b.last_updated)
  return {
    firstSeen: first && simDay(first),
    lastUpdated: last && last !== first ? simDay(last) : null,
  }
}

/** A day label for a version or an evidence line, or null. */
export const dayLabel = (iso: string | null | undefined) => {
  const d = isoDay(iso)
  return d ? simDay(d) : null
}

export type Evidence = { text: string; when: string | null; detail: string | null }

/**
 * Hindsight writes facts as "What happened. | When: 2026-04-01 | Involving: … | Why it mattered."
 * Split them so the timeline can show the event, its day and the reason separately.
 * "Involving" repeats who is already named in the sentence, so it's dropped.
 */
export function parseEvidence(line: string): Evidence {
  const parts = line
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  let when: string | null = null
  const rest: string[] = []
  for (const p of parts) {
    const m = p.match(/^(When|Involving):\s*(.*)$/i)
    if (!m) rest.push(p)
    else if (m[1].toLowerCase() === 'when') when = isoDay(m[2].trim())
  }
  const [text = line.trim(), ...detail] = rest
  return { text, when, detail: detail.length ? detail.join(' ') : null }
}
