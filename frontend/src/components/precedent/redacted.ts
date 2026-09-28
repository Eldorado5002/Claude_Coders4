export type RedactedPart = string | { kind: string }

/** "[REDACTED:phone]" markers (from the backend's PII redaction) → parts the UI renders as chips. */
export function splitRedacted(text: string): RedactedPart[] {
  const parts: RedactedPart[] = []
  const rx = /\[REDACTED:([a-z_]+)\]/g
  let last = 0
  for (const m of text.matchAll(rx)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push({ kind: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}
