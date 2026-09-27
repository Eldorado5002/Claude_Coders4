import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useObjectUrl } from './use-object-url'

afterEach(() => vi.restoreAllMocks())

describe('useObjectUrl', () => {
  it('revokes the previous URL on change and the last one on unmount; PDFs get none', () => {
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${++n}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useObjectUrl())

    act(() => result.current[1](new File(['a'], 'a.png', { type: 'image/png' })))
    expect(result.current[0]).toBe('blob:test/1')

    act(() => result.current[1](new File(['b'], 'b.jpg', { type: 'image/jpeg' })))
    expect(revoke).toHaveBeenLastCalledWith('blob:test/1')
    expect(result.current[0]).toBe('blob:test/2')

    act(() => result.current[1](new File(['c'], 'c.pdf', { type: 'application/pdf' })))
    expect(revoke).toHaveBeenLastCalledWith('blob:test/2')
    expect(result.current[0]).toBeNull()

    act(() => result.current[1](new File(['d'], 'd.webp', { type: 'image/webp' })))
    unmount()
    expect(revoke).toHaveBeenLastCalledWith('blob:test/3')
  })
})
