import { describe, expect, it } from 'vitest'
import { connectorDelay, stagger } from './motion'

describe('stagger (entering lists: 40 ms apart, never a long wait)', () => {
  it('spaces items 40 ms apart', () => {
    expect([0, 1, 2].map((i) => stagger(i))).toEqual([0, 40, 80])
  })
  it('stops adding delay after the sixth item, so long lists arrive together', () => {
    expect(stagger(5)).toBe(200)
    expect(stagger(12)).toBe(200)
  })
  it('can start after something else has entered', () => {
    expect(stagger(1, { after: 60 })).toBe(100)
  })
})

describe('connectorDelay (the stage rail draws in order, and undraws in reverse)', () => {
  it('draws the lines into newly reached stages one after another', () => {
    // Day 1 (0) → Twist (3): lines 1, 2, 3 draw, 150 ms apart
    expect([1, 2, 3].map((i) => connectorDelay(i, 0, 3))).toEqual([0, 150, 300])
  })
  it('leaves lines that were already drawn alone', () => {
    expect(connectorDelay(1, 1, 3)).toBe(0)
    expect(connectorDelay(3, 1, 3)).toBe(150)
  })
  it('undraws from the far end on a reset', () => {
    // Twist (3) → Day 1 (0): line 3 goes first
    expect([3, 2, 1].map((i) => connectorDelay(i, 3, 0))).toEqual([0, 150, 300])
  })
})
