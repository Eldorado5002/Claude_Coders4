import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Belief, BeliefVersion } from '@/api/types'
import twistBeliefs from '@mocks/twist/beliefs.json'
import weekBeliefs from '@mocks/beliefs.json'
import {
  beliefDates,
  beliefsErrorCopy,
  isoDay,
  memoriesLabel,
  orderVersions,
  parseEvidence,
  revisedByLabel,
  versionsLabel,
} from './beliefs-view'

const ver = (as_of: string | null, text = as_of ?? 'undated'): BeliefVersion => ({ text, as_of, new_evidence: [] })

describe('isoDay', () => {
  it('keeps the calendar day of an ISO timestamp, whatever its precision or zone', () => {
    expect(isoDay('2026-03-02T12:36:00Z')).toBe('2026-03-02')
    expect(isoDay('2026-03-12T12:30:00.010000Z')).toBe('2026-03-12')
    // late in the UTC day must not roll over into the next local day
    expect(isoDay('2026-04-22T23:59:59Z')).toBe('2026-04-22')
    expect(isoDay('2026-04-01')).toBe('2026-04-01')
  })
  it('has nothing for missing or malformed input', () => {
    expect(isoDay(null)).toBeNull()
    expect(isoDay(undefined)).toBeNull()
    expect(isoDay('')).toBeNull()
    expect(isoDay('last week')).toBeNull()
  })
})

describe('orderVersions', () => {
  it('lists versions oldest first', () => {
    const rows = [ver('2026-04-10T09:00:00Z'), ver('2026-03-18T11:50:00Z'), ver('2026-03-25T09:02:05.500000Z')]
    expect(orderVersions(rows).map((v) => v.as_of)).toEqual([
      '2026-03-18T11:50:00Z',
      '2026-03-25T09:02:05.500000Z',
      '2026-04-10T09:00:00Z',
    ])
  })
  it('keeps undated versions first, in the order the server sent them, and leaves the input alone', () => {
    const rows = [ver('2026-04-10T09:00:00Z'), ver(null, 'a'), ver('2026-03-18T11:50:00Z'), ver(null, 'b')]
    expect(orderVersions(rows).map((v) => v.text)).toEqual(['a', 'b', '2026-03-18T11:50:00Z', '2026-04-10T09:00:00Z'])
    expect(rows[0].as_of).toBe('2026-04-10T09:00:00Z')
  })
  it('copes with no history', () => {
    expect(orderVersions([])).toEqual([])
  })
})

describe('versionsLabel', () => {
  it('counts versions in the disclosure label', () => {
    expect(versionsLabel(1)).toBe('How this belief changed (1 version)')
    expect(versionsLabel(3)).toBe('How this belief changed (3 versions)')
  })
})

describe('memoriesLabel', () => {
  it('says memory or memories', () => {
    expect(memoriesLabel(1)).toBe('1 memory')
    expect(memoriesLabel(7)).toBe('7 memories')
    expect(memoriesLabel(0)).toBe('0 memories')
  })
})

describe('revisedByLabel', () => {
  it('introduces the evidence that changed a version', () => {
    expect(revisedByLabel(1)).toBe('Revised by 1 new memory')
    expect(revisedByLabel(3)).toBe('Revised by 3 new memories')
  })
})

describe('beliefsErrorCopy', () => {
  it('says quietly when Hindsight is down', () => {
    expect(beliefsErrorCopy(new ApiError(503, 'Hindsight unavailable'))).toBe(
      'Hindsight isn’t answering, so beliefs can’t be shown right now.',
    )
  })
  it('says when the API itself is unreachable', () => {
    expect(beliefsErrorCopy(new ApiError(0, 'Failed to fetch'))).toBe('Can’t reach the Precedent API.')
  })
  it('falls back to a plain sentence', () => {
    expect(beliefsErrorCopy(new ApiError(500, 'boom'))).toBe('Beliefs didn’t load.')
    expect(beliefsErrorCopy(new Error('x'))).toBe('Beliefs didn’t load.')
  })
})

describe('beliefDates', () => {
  it('formats first seen and last updated as simulated days', () => {
    const b = (twistBeliefs as Belief[])[0]
    expect(beliefDates(b)).toEqual({ firstSeen: '2 Mar', lastUpdated: '22 Apr' })
  })
  it('drops last updated when it is the same day as first seen', () => {
    const b = (twistBeliefs as Belief[])[1]
    expect(beliefDates(b)).toEqual({ firstSeen: '25 Mar', lastUpdated: null })
  })
  it('reads microsecond timestamps from Hindsight', () => {
    expect(beliefDates((weekBeliefs as Belief[])[0])).toEqual({ firstSeen: '2 Mar', lastUpdated: '12 Mar' })
  })
  it('copes with missing dates', () => {
    expect(beliefDates({ first_seen: null, last_updated: '2026-03-12T12:30:00Z' })).toEqual({
      firstSeen: null,
      lastUpdated: '12 Mar',
    })
    expect(beliefDates({})).toEqual({ firstSeen: null, lastUpdated: null })
  })
})

describe('parseEvidence', () => {
  it('splits a Hindsight fact into what happened, when, and why', () => {
    const line = (twistBeliefs as Belief[])[0].versions[0].new_evidence[0]
    expect(parseEvidence(line)).toEqual({
      text: 'Precedent (AP agent) approved invoice SBST/2526/0964 for Shree Balaji Steel Traders Pvt Ltd due to a freight charge exception.',
      when: '2026-04-01',
      detail: 'The freight charge of ₹3,300.00 is within the standing agreement limit of ₹5,000.00 per trip.',
    })
  })
  it('keeps a plain line as it is', () => {
    expect(parseEvidence('Sneha approved a ₹4,650 freight charge.')).toEqual({
      text: 'Sneha approved a ₹4,650 freight charge.',
      when: null,
      detail: null,
    })
  })
  it('ignores a date it cannot read and joins extra clauses', () => {
    expect(parseEvidence('Held invoice X. | When: sometime | First reason. | Second reason.')).toEqual({
      text: 'Held invoice X.',
      when: null,
      detail: 'First reason. Second reason.',
    })
  })
  it('leaves redaction markers intact', () => {
    expect(parseEvidence('Call [REDACTED:phone] before paying. | When: 2026-04-02').text).toBe('Call [REDACTED:phone] before paying.')
  })
})
