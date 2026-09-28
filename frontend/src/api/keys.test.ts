import { describe, expect, it } from 'vitest'
import { eventInvalidations, qk } from './keys'

describe('query keys', () => {
  it('scopes a case by memory mode so both verdicts stay cached', () => {
    expect(qk.exception('EXC-0014', true)).toEqual(['exception', 'EXC-0014', true])
    expect(qk.exception('EXC-0014', false)).not.toEqual(qk.exception('EXC-0014', true))
  })
  it('puts filters into the list key', () => {
    expect(qk.exceptions({ status: 'open' })).toEqual(['exceptions', { status: 'open' }])
  })
})

describe('eventInvalidations', () => {
  it('refreshes lists and the case on exception.updated', () => {
    const keys = eventInvalidations('exception.updated', { id: 'EXC-0014' })
    expect(keys).toEqual(expect.arrayContaining([['exceptions'], ['exception', 'EXC-0014'], ['vendors'], ['metrics']]))
  })
  it('refreshes the ladder, open cases and the vendor on autonomy.changed', () => {
    const keys = eventInvalidations('autonomy.changed', { vendor_id: 'V001' })
    expect(keys).toEqual(expect.arrayContaining([['autonomy'], ['exception'], ['vendor', 'V001']]))
  })
  it('refreshes lessons and trust when a lesson is revoked', () => {
    const keys = eventInvalidations('memory.revoked', { case_id: 'EXC-0042' })
    expect(keys).toEqual(expect.arrayContaining([['lessons'], ['autonomy'], ['exceptions'], ['exception']]))
  })
  it('refreshes memory surfaces on memory.retained', () => {
    const keys = eventInvalidations('memory.retained', { id: 'EXC-1' })
    expect(keys).toEqual(expect.arrayContaining([['memory'], ['lessons'], ['metrics']]))
  })
  it('refreshes everything on sim.changed, whatever its payload shape', () => {
    expect(eventInvalidations('sim.changed', { sim_day: 16 })).toBe('all')
    expect(eventInvalidations('sim.changed', { stage: 'week3', stages: [] })).toBe('all')
  })
  it('ignores unknown events', () => {
    expect(eventInvalidations('something.else', {})).toEqual([])
  })
})

describe('round-2 invalidations', () => {
  it('refreshes the autonomy certificate when decisions or trust change', () => {
    for (const e of ['exception.updated', 'autonomy.changed', 'memory.revoked'])
      expect(eventInvalidations(e, { id: 'EXC-1', vendor_id: 'V001' })).toEqual(expect.arrayContaining([['certificate']]))
  })
  it('refreshes that vendor’s beliefs when a lesson is retained', () => {
    expect(eventInvalidations('memory.retained', { vendor_id: 'V001' })).toEqual(expect.arrayContaining([['beliefs', 'V001']]))
  })
  it('refreshes vendor risk when a new exception arrives', () => {
    expect(eventInvalidations('exception.created', { id: 'EXC-9' })).toEqual(expect.arrayContaining([['risk']]))
  })
  it('a new or changed case refreshes Benford and that vendor’s file (its risk figure lives there)', () => {
    const summary = { id: 'EXC-9', vendor: { id: 'V007', name: 'X' } }
    for (const e of ['exception.created', 'exception.updated']) {
      const keys = eventInvalidations(e, summary)
      expect(keys).toEqual(expect.arrayContaining([['benford'], ['vendor', 'V007']]))
    }
    expect(eventInvalidations('exception.updated', summary)).toEqual(expect.arrayContaining([['risk']]))
  })
  it('a revoked lesson refreshes that vendor’s beliefs and file', () => {
    const lesson = { case_id: 'EXC-3', vendor: { id: 'V002', name: 'Y' } }
    expect(eventInvalidations('memory.revoked', lesson)).toEqual(expect.arrayContaining([['beliefs', 'V002'], ['vendor', 'V002']]))
  })
  it('never makes a vendor key out of a payload without a vendor', () => {
    const keys = eventInvalidations('exception.created', { id: 'EXC-9' }) as unknown[][]
    expect(keys.some((k) => k[0] === 'vendor')).toBe(false)
  })
})
