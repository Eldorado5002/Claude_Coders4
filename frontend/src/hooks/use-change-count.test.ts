import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChangeCount } from './use-change-count'

describe('useChangeCount (animate a live change, never the first render)', () => {
  it('is 0 on mount and counts each later change of the value', () => {
    const { result, rerender } = renderHook(({ v }) => useChangeCount(v), { initialProps: { v: 'approve|95' } })
    expect(result.current).toBe(0)
    rerender({ v: 'approve|95' })
    expect(result.current).toBe(0)
    rerender({ v: 'hold|40' })
    expect(result.current).toBe(1)
    rerender({ v: 'approve|95' })
    expect(result.current).toBe(2)
  })
})
