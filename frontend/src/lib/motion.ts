/** Entering lists: items 40 ms apart (30–80 ms reads as a sequence, not a queue). */
export const STAGGER_MS = 40
/** From the sixth item on, the rest arrive together: a long list never keeps anyone waiting. */
export const STAGGER_CAP = 6

/** Animation delay (ms) for the i-th item of an entering list, optionally after something else has entered. */
export function stagger(i: number, { after = 0 }: { after?: number } = {}): number {
  return after + Math.min(i, STAGGER_CAP - 1) * STAGGER_MS
}

/** Stage rail lines overlap as they draw, so a jump across several stages reads as one movement. */
export const CONNECTOR_STEP_MS = 150

/**
 * Delay (ms) before connector `i` (the line into stage i) moves when the rail goes from stage `from` to `to`:
 * forward, lines draw left to right; backward (a reset), they undraw from the far end. Untouched lines: 0.
 */
export function connectorDelay(i: number, from: number, to: number): number {
  if (to > from && i > from && i <= to) return (i - from - 1) * CONNECTOR_STEP_MS
  if (to < from && i > to && i <= from) return (from - i) * CONNECTOR_STEP_MS
  return 0
}
