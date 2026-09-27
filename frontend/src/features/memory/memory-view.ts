import { ApiError } from '@/api/client'
import type { CitationKind, MemoryItem } from '@/api/types'

export type MemoryTab = 'lessons' | 'policy' | 'raw'

export function parseTab(s: string | null): MemoryTab {
  return s === 'policy' || s === 'raw' ? s : 'lessons'
}

/** Raw → distilled: facts, the agent's own history, merged patterns, rewritten playbooks, hard rules. */
export const KINDS: readonly CitationKind[] = ['world', 'experience', 'observation', 'mental_model', 'directive']

export type KindFilter = CitationKind | 'all'

export function parseKind(s: string | null): KindFilter {
  return KINDS.includes(s as CitationKind) ? (s as CitationKind) : 'all'
}

export function kindCounts(items: MemoryItem[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = {
    all: items.length,
    observation: 0,
    world: 0,
    experience: 0,
    mental_model: 0,
    directive: 0,
  }
  for (const m of items) counts[m.kind] += 1
  return counts
}

export function filterByKind(items: MemoryItem[], kind: KindFilter): MemoryItem[] {
  return kind === 'all' ? items : items.filter((m) => m.kind === kind)
}

export type MemoryText = { body: string; facts: { label: string; value: string }[]; notes: string[] }

const FACT = /^([A-Z][A-Za-z ]{1,19}):\s+(.+)$/

/** Hindsight appends " | When: … | Involving: … | detail" to facts; pull those apart for reading. */
export function splitMemoryText(text: string): MemoryText {
  const [body, ...rest] = text.split(/\s+\|\s+/)
  const out: MemoryText = { body: body.trim(), facts: [], notes: [] }
  for (const part of rest) {
    const m = FACT.exec(part.trim())
    if (m) out.facts.push({ label: m[1], value: m[2].trim() })
    else if (part.trim()) out.notes.push(part.trim())
  }
  return out
}

/** 503 (Hindsight down) or 0 (API unreachable): memory can't be shown at all. */
export function isHindsightDown(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 503 || e.status === 0)
}
