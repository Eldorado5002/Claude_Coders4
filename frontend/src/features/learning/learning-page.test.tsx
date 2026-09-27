import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { qk } from '@/api/keys'
import type { Metrics } from '@/api/types'
import metricsMock from '@mocks/metrics.json'
import LearningPage from './learning-page'

const failure = vi.hoisted(() => ({ error: null as Error | null }))
vi.mock('@/api/queries', async (orig) => {
  const real = await orig<typeof import('@/api/queries')>()
  return {
    ...real,
    metricsQ: () => ({
      queryKey: ['metrics'] as const,
      queryFn: () => (failure.error ? Promise.reject(failure.error) : new Promise<never>(() => {})),
    }),
  }
})

const metrics = metricsMock as Metrics

function renderPage(seed?: Metrics) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (seed) client.setQueryData(qk.metrics, seed)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/learning']}>
        <LearningPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  failure.error = null
})

describe('LearningPage', () => {
  it('leads with the replay headline and cites its footnote', () => {
    renderPage(metrics)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('In months 5–6, Precedent was right 96% of the time with memory, 35% without.')
    expect(within(h1).getByRole('link', { name: 'Note 5' })).toHaveAttribute('href', '#learning-note-5')
  })

  it('shows the row of figures, with false approvals as the trust number', () => {
    renderPage(metrics)
    for (const label of ['Touchless rate', 'Acceptance', 'Citation relevance', 'Exceptions', 'Auto-resolved', 'Blocked by controls', 'False approvals', 'Lessons revoked', 'Memories', 'Hours saved'])
      expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Paid when it should not have been')).toBeInTheDocument()
  })

  it('draws both learning curves, each with a table view', () => {
    renderPage(metrics)
    expect(screen.getByRole('heading', { name: 'Resolved without a human' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recommendation accuracy' })).toBeInTheDocument()
    expect(screen.getAllByText('View as table')).toHaveLength(2)
    expect(screen.getAllByRole('table')).toHaveLength(2)
    expect(screen.queryByText('Baseline (memory off) not available yet')).not.toBeInTheDocument()
  })

  it('says when there is no memory-off baseline', () => {
    const noBaseline: Metrics = {
      ...metrics,
      touchless_by_week: metrics.touchless_by_week.map((p) => ({ ...p, memory_off: null })),
    }
    renderPage(noBaseline)
    expect(screen.getAllByText('Baseline (memory off) not available yet')).toHaveLength(1)
  })

  it('never draws a bar for hard controls', () => {
    renderPage(metrics)
    // duplicate, bank change, over ₹5L in the mock
    expect(screen.getAllByText('0% by design — always human')).toHaveLength(3)
    expect(screen.getByRole('img', { name: 'Freight: 30% resolved without a human' })).toBeInTheDocument()
  })

  it('lists every assumption as a numbered footnote', () => {
    renderPage(metrics)
    const notes = screen.getAllByRole('listitem').filter((li) => li.id.startsWith('learning-note-'))
    expect(notes).toHaveLength(metrics.assumptions.length)
  })

  it('shows skeletons while loading', () => {
    const { container } = renderPage()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('explains an unreachable Hindsight plainly', async () => {
    failure.error = new ApiError(503, 'Hindsight unavailable')
    renderPage()
    expect(await screen.findByText('Hindsight memory is unreachable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
