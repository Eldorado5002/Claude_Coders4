import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { qk } from '@/api/keys'
import type { DemoState } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import demoMock from '@mocks/demo-state.json'
import { StageRail } from './stage-rail'

const at = (stage: DemoState['stage']): DemoState => {
  const d = demoMock as unknown as DemoState
  const i = d.stages.findIndex((s) => s.id === stage)
  return { ...d, stage, busy: false, stages: d.stages.map((s, n) => ({ ...s, reached: n <= i })) }
}

const lines = () => [...document.querySelectorAll<HTMLElement>('[data-connector]')]

describe('StageRail', () => {
  it('draws the lines into the new stages in order when the demo jumps ahead, and not on first paint', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(qk.demo, at('day1'))
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <StageRail />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(lines().map((l) => l.dataset.reached)).toEqual([undefined, undefined, undefined])
    expect(lines().every((l) => !l.style.transitionDelay || l.style.transitionDelay === '0ms')).toBe(true)

    // the query cache notifies on the next tick
    await act(async () => qc.setQueryData(qk.demo, at('twist')))
    await waitFor(() => expect(lines().map((l) => l.dataset.reached)).toEqual(['true', 'true', 'true']))
    expect(lines().map((l) => l.style.transitionDelay)).toEqual(['0ms', '150ms', '300ms'])
  })
})
