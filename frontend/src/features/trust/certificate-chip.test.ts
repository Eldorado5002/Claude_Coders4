import { describe, expect, it } from 'vitest'
import type { AutonomyCertificate } from '@/api/types'
import collecting from '@mocks/certificate.json'
import certified from '@mocks/replay-end/certificate.json'
import { certificateChip } from './certificate-chip'

const c = (x: unknown) => x as AutonomyCertificate

describe('certificateChip', () => {
  it('reads certified with the auto-pay threshold', () => {
    expect(certificateChip(c(certified))).toEqual({ label: 'Certified', detail: 'auto-pay at ≥ 0.75', tone: 'certified' })
  })
  it('shows progress toward certification while collecting', () => {
    expect(certificateChip(c(collecting))).toEqual({
      label: 'Collecting evidence',
      detail: '2 of 59 verified decisions',
      tone: 'collecting',
    })
  })
  it('says auto-pay is paused', () => {
    expect(certificateChip(c({ ...certified, status: 'paused', threshold: null, errors: 3 }))).toMatchObject({
      label: 'Auto-pay paused',
      tone: 'paused',
    })
  })
})
