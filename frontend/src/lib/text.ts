// Abbreviations that end with a full stop but don't end a sentence (Indian business writing).
const ABBREV = /(?:^|\s)(?:pvt|ltd|co|inc|rs|no|nos|vs|e\.g|i\.e|etc|approx|mr|mrs|ms|dr|st|qty|amt)\.$/i

/** The first sentence of the agent's rationale, used to prefill the clerk's reason on Accept. */
export function firstSentence(text: string): string {
  const s = text.trim()
  const rx = /[.!?](?=\s+|$)/g
  for (let m = rx.exec(s); m; m = rx.exec(s)) {
    const upTo = s.slice(0, m.index + 1)
    if (m[0] === '.' && ABBREV.test(upTo)) continue
    return upTo
  }
  return s
}
