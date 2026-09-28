import type { Metrics, Performance } from '@/api/types'
import { Section } from '@/components/precedent'
import { Safe } from '@/components/precedent/safe'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CalibrationChart } from './calibration-chart'
import { CertificateCard } from './certificate-card'
import { PerformanceFigures } from './figures'
import { hasTrustData } from './trust-view'

/** Anchor for /learning#trust (the trust map links here). */
export const TRUST_ANCHOR = 'trust'

function CostAndSpeed({ p }: { p: Performance }) {
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="cost-title">
      <div className="space-y-1">
        <h3 id="cost-title" className="serif-display text-[1.4rem] leading-tight">
          Cost and speed
        </h3>
        <p className="text-xs text-pretty text-muted-foreground">
          Model spend and time per recommendation. Routine cases take the fast path; the rest get deeper reasoning.
        </p>
      </div>
      <PerformanceFigures p={p} />
    </section>
  )
}

/**
 * "Trust you can check": the autonomy certificate, calibration, and cost and speed, all from
 * `GET /api/metrics`. Each block hides on its own when the API has nothing for it yet.
 */
export function TrustSection({ m }: { m: Metrics }) {
  if (!hasTrustData(m)) return null
  const { certificate, calibration, performance } = m
  const both = calibration != null && performance != null

  return (
    <div id={TRUST_ANCHOR} className="scroll-mt-24">
      <Section title="Trust you can check">
        <div className="space-y-12 pt-2">
          {certificate && (
            <Safe label="The autonomy certificate">
              <CertificateCard c={certificate} />
            </Safe>
          )}
          {(calibration || performance) && (
            <div className="@container">
              <div className={cn('grid gap-12', both && '@min-[1000px]:grid-cols-2 @min-[1000px]:gap-10')}>
                {calibration && (
                  <Safe label="This chart">
                    <CalibrationChart cal={calibration} />
                  </Safe>
                )}
                {performance && (
                  <Safe label="The cost figures">
                    <CostAndSpeed p={performance} />
                  </Safe>
                )}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

export function TrustSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
