import type { AutonomyCertificate } from '@/api/types'

/** P(X ≤ k) for X ~ Binomial(n, p), summed term by term. */
function binomCdf(k: number, n: number, p: number): number {
  let term = Math.pow(1 - p, n)
  let sum = term
  for (let i = 0; i < k; i++) {
    term *= ((n - i) / (i + 1)) * (p / (1 - p))
    sum += term
  }
  return sum
}

/**
 * Verified pay decisions needed before auto-pay is certified, if no more are wrong. The backend's own number
 * when its explanation states it ("…takes 59 of them…"); otherwise the smallest n whose one-sided
 * Clopper–Pearson upper bound on the wrong-payment rate is at or below the target (0 errors at 5% / 95% → 59).
 */
export function decisionsNeeded(
  c: Pick<AutonomyCertificate, 'explanation' | 'errors' | 'target_error' | 'confidence_level'>,
): number | null {
  const stated = c.explanation.match(/takes (\d+)/)
  if (stated) return Number(stated[1])
  const alpha = 1 - c.confidence_level
  for (let n = Math.max(1, c.errors + 1); n <= 100_000; n++) {
    if (binomCdf(c.errors, n, c.target_error) <= alpha + 1e-12) return n
  }
  return null
}
