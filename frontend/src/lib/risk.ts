const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** A backend risk reason as a sentence: "1 request(s) to pay…" → "1 request to pay…", first letter capitalised. */
export function tidyReason(reason: string): string {
  const count = /^\s*(\d+)\b/.exec(reason)
  const one = count != null && Number(count[1]) === 1
  return capitalise(reason.trim().replace(/\(s\)/g, one ? '' : 's'))
}
