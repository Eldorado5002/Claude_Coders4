import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { qk } from '@/api/keys'
import type { BenfordResult, VendorRiskRow } from '@/api/types'
import week3Benford from '@mocks/benford.json'
import week3Risk from '@mocks/risk.json'
import twistBenford from '@mocks/twist/benford.json'
import twistRisk from '@mocks/twist/risk.json'
import RiskPage from './risk-page'

const failure = vi.hoisted(() => ({ risk: null as Error | null, benford: null as Error | null }))
vi.mock('@/api/queries', async (orig) => {
  const real = await orig<typeof import('@/api/queries')>()
  const pendingOr = (e: Error | null) => (e ? Promise.reject(e) : new Promise<never>(() => {}))
  return {
    ...real,
    riskQ: () => ({ queryKey: ['risk'] as const, queryFn: () => pendingOr(failure.risk) }),
    benfordQ: () => ({ queryKey: ['benford'] as const, queryFn: () => pendingOr(failure.benford) }),
  }
})

function renderPage(seed: { risk?: VendorRiskRow[]; benford?: BenfordResult } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (seed.risk) client.setQueryData(qk.risk, seed.risk)
  if (seed.benford) client.setQueryData(qk.benford, seed.benford)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/risk']}>
        <RiskPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const twist = { risk: twistRisk as VendorRiskRow[], benford: twistBenford as BenfordResult }
const week3 = { risk: week3Risk as VendorRiskRow[], benford: week3Benford as BenfordResult }

/** Matches an element by its full text, ignoring how it is split into spans. */
const fullText = (text: string, tag = 'P') => (_: string, el: Element | null) =>
  el?.tagName === tag && el.textContent?.replace(/\s+/g, ' ').trim() === text

afterEach(() => {
  failure.risk = null
  failure.benford = null
})

describe('RiskPage', () => {
  it('puts Balaji at the top at the Twist: 58, High, with the reasons in plain words', () => {
    renderPage(twist)
    const top = screen.getByRole('list', { name: 'Vendors to look at first' })
    const first = within(top).getAllByRole('listitem')[0]
    expect(within(first).getByRole('link', { name: 'Shree Balaji Steel Traders Pvt Ltd' })).toHaveAttribute('href', '/vendors/V001')
    expect(first).toHaveTextContent('58')
    expect(within(first).getByText('High')).toBeInTheDocument()
    expect(within(first).getByText('1 request to pay a different bank account')).toBeInTheDocument()
    expect(within(first).getByText('Exception rate 91% vs 23% across all vendors')).toBeInTheDocument()
    expect(within(top).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/vendors/V001',
      '/vendors/V005',
      '/vendors/V012',
    ])
  })

  it('lists everyone else in rank order, with "No risk signals" for quiet vendors', () => {
    renderPage(twist)
    expect(screen.getByText('25 vendors · 1 high · 4 with signals')).toBeInTheDocument()
    const rest = screen.getByRole('list', { name: 'Vendor ranking, highest risk first' })
    const rows = within(rest).getAllByRole('listitem').filter((li) => li.parentElement === rest)
    expect(rows).toHaveLength(22)
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/vendors/V002')
    expect(within(rows[0]).getByText('2 invoices unusual for this vendor (anomaly model)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('No risk signals')).toBeInTheDocument()
  })

  it('stays calm at Week 3 when no vendor shows a signal', () => {
    renderPage(week3)
    expect(screen.getByText('No vendor shows a fraud or control signal yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Vendors to look at first' })).not.toBeInTheDocument()
    expect(screen.getAllByText('No risk signals')).toHaveLength(25)
    expect(screen.getByText('25 vendors · none flagged')).toBeInTheDocument()
  })

  it('gives the Benford verdict, the sample size, the explanation and a table view', () => {
    renderPage(twist)
    expect(screen.getByText(fullText('MAD 0.0146 · marginal'))).toBeInTheDocument()
    expect(screen.getByText('296 invoice amounts analysed')).toBeInTheDocument()
    expect(
      screen.getByText('In genuine financial data, about 30% of amounts start with 1. Large deviations can point to invented invoices.'),
    ).toBeInTheDocument()
    expect(screen.getByText('View as table')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(10) // header + digits 1–9
    expect(within(table).getByText('31.8%')).toBeInTheDocument()
    // the current Nigrini band is marked for assistive tech too
    const current = screen.getByText('(this result)').closest('li')
    expect(current).toHaveTextContent('Marginal')
  })

  it('says "insufficient data" when there is no MAD', () => {
    renderPage({ ...twist, benford: { ...twist.benford, n: 11, mad: null, conformity: 'insufficient data' } })
    expect(screen.getByText(fullText('Insufficient data'))).toBeInTheDocument()
    expect(screen.getByText('Only 11 amounts so far. The test needs at least 50.')).toBeInTheDocument()
    expect(screen.queryByText('(this result)')).not.toBeInTheDocument()
  })

  it('shows an empty state when no amounts or vendors exist yet', () => {
    renderPage({ risk: [], benford: { ...twist.benford, n: 0, mad: null, conformity: 'insufficient data' } })
    expect(screen.getByText('No vendors to rank yet.')).toBeInTheDocument()
    expect(screen.getByText('No invoice amounts yet.')).toBeInTheDocument()
  })

  it('shows skeletons while loading', () => {
    renderPage()
    expect(screen.getByLabelText('Loading the vendor ranking')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Loading the Benford test')).toHaveAttribute('aria-busy', 'true')
  })

  it('explains an unreachable API and a Hindsight outage, each with a retry', async () => {
    failure.risk = new ApiError(0, 'Cannot reach the Precedent API')
    failure.benford = new ApiError(503, 'Hindsight unavailable')
    renderPage()
    expect(await screen.findByText('Can’t reach the Precedent API.')).toBeInTheDocument()
    expect(await screen.findByText('Hindsight memory is unreachable.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2)
  })
})
