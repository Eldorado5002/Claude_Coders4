import { describe, expect, it } from 'vitest'
import { dotTone, momentFor } from './live-moments'

const created = {
  id: 'EXC-0043',
  primary_type: 'bank_details_changed',
  blocking: true,
  vendor: { id: 'V001', name: 'Shree Balaji Steel Traders Pvt Ltd' },
}

describe('momentFor', () => {
  it('announces a new exception, calling out hard controls', () => {
    expect(momentFor('exception.created', created, false)).toEqual({
      title: 'Hard control blocked an invoice',
      description: 'Shree Balaji Steel Traders Pvt Ltd · Bank change · EXC-0043',
    })
    expect(momentFor('exception.created', { ...created, blocking: false, primary_type: 'freight_charge' }, false)?.title).toBe(
      'New exception',
    )
  })
  it('shows what the agent learned', () => {
    expect(momentFor('memory.retained', { text: 'Balaji · freight: approve — “under cap”' }, false)).toEqual({
      title: '◆ Precedent learned',
      description: 'Balaji · freight: approve — “under cap”',
    })
  })
  it('stays quiet while the simulator replays days, and for other events', () => {
    expect(momentFor('exception.created', created, true)).toBeNull()
    expect(momentFor('memory.retained', { text: 'x' }, true)).toBeNull()
    expect(momentFor('autonomy.changed', {}, false)).toBeNull()
  })
})

describe('dotTone', () => {
  it('greys out when live updates are disconnected, whatever Hindsight says', () => {
    expect(dotTone('up', 'closed')).toBe('offline')
  })
  it('follows Hindsight health otherwise', () => {
    expect(dotTone('up', 'open')).toBe('up')
    expect(dotTone('down', 'open')).toBe('down')
    expect(dotTone(undefined, 'connecting')).toBe('unknown')
    expect(dotTone('up', 'off')).toBe('up')
  })
})
