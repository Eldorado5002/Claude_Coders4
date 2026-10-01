import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newToastIds, useToastChime } from './toast-chime'

vi.mock('@/lib/sound', () => ({ playChime: vi.fn(() => true), unlockAudioOnFirstGesture: vi.fn(() => () => {}) }))
const { playChime } = await import('@/lib/sound')

afterEach(() => {
  toast.dismiss()
  vi.mocked(playChime).mockClear()
})

describe('newToastIds', () => {
  it('returns only ids it has not seen, and remembers them', () => {
    const seen = new Set<string | number>()
    expect(newToastIds(['a', 1], seen)).toEqual(['a', 1])
    expect(newToastIds(['a', 1, 'b'], seen)).toEqual(['b'])
    expect(newToastIds([], seen)).toEqual([])
  })
})

describe('useToastChime', () => {
  it('chimes for every new notification, errors included, but not when one updates', async () => {
    renderHook(() => useToastChime())
    act(() => {
      toast('Now at Week 3', { id: 'chime-1' })
    })
    await waitFor(() => expect(playChime).toHaveBeenCalledTimes(1))

    act(() => {
      toast('Now at Week 3, updated', { id: 'chime-1' })
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(playChime).toHaveBeenCalledTimes(1)

    act(() => {
      toast.error('Couldn’t turn on notifications', { id: 'chime-2' })
    })
    await waitFor(() => expect(playChime).toHaveBeenCalledTimes(2))
  })
})
