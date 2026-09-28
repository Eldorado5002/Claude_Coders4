import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { qk } from '@/api/keys'
import type { Metrics } from '@/api/types'
import metricsMock from '@mocks/metrics.json'
import twistMetrics from '@mocks/twist/metrics.json'
import { isHardControl } from '@/lib/labels'
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

function renderPage(seed?: Metrics, path = '/learning') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (seed) client.setQueryData(qk.metrics, seed)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
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
    expect(h1).toHaveTextContent('In months 5–6, Precedent was right 98% of the time with memory, 50% without.')
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
    // Week 3 has no hard-control cases yet; the Twist does
    const twist = twistMetrics as unknown as Metrics
    renderPage(twist)
    const hard = twist.by_type.filter((t) => isHardControl(t.type))
    expect(hard.length).toBeGreaterThan(0)
    expect(screen.getAllByText('0% by design — always human')).toHaveLength(hard.length)
    const freight = twist.by_type.find((t) => t.type === 'freight_charge')!
    expect(
      screen.getByRole('img', { name: `Freight: ${Math.round(freight.touchless_rate * 100)}% resolved without a human` }),
    ).toBeInTheDocument()
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

  it('adds the MSME figures to the live docket row, in the warning tone while any are at risk', () => {
    renderPage(twistMetrics as unknown as Metrics)
    expect(screen.getByText('MSME invoices at risk')).toBeInTheDocument()
    expect(screen.getByText('MSME tax at risk')).toBeInTheDocument()
    expect(screen.getByText('Tax deduction at stake under 43B(h)').parentElement).toHaveClass('text-hold')
  })

  it('keeps the MSME figures neutral when nothing is at risk', () => {
    renderPage(metrics)
    expect(screen.getByText('MSME invoices at risk').parentElement).not.toHaveClass('text-hold')
  })

  it('puts "Trust you can check" after the curves and before the breakdown', () => {
    renderPage(metrics)
    const eyebrows = ['Learning curves', 'Trust you can check', 'By exception type'].map((t) => screen.getByText(t))
    expect(eyebrows[0].compareDocumentPosition(eyebrows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(eyebrows[1].compareDocumentPosition(eyebrows[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('scrolls to the trust section when opened at /learning#trust', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { container } = renderPage(metrics, '/learning#trust')
    const trust = container.querySelector('#trust')
    expect(trust).toBeInTheDocument()
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(trust)
    scroll.mockRestore()
  })

  it('explains an unreachable Hindsight plainly', async () => {
    failure.error = new ApiError(503, 'Hindsight unavailable')
    renderPage()
    expect(await screen.findByText('Hindsight memory is unreachable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
