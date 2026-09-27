import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFresh } from './use-fresh'

describe('useFresh', () => {
  it('flags only cases that arrive while the same view stays open', () => {
    const { result, rerender } = renderHook(({ ids, view }) => useFresh(ids, view), {
      initialProps: { ids: ['A', 'B'], view: 'open' },
    })
    expect(result.current.size).toBe(0)
    rerender({ ids: ['C', 'A', 'B'], view: 'open' })
    expect([...result.current]).toEqual(['C'])
  })

  it('does not flash every row when the user switches tab or filter', () => {
    const { result, rerender } = renderHook(({ ids, view }) => useFresh(ids, view), {
      initialProps: { ids: ['A', 'B'], view: 'open' },
    })
    rerender({ ids: ['X', 'Y', 'Z'], view: 'auto_resolved' })
    expect(result.current.size).toBe(0)
  })
})
