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
