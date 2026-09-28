import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import type { VendorProfile, VendorSummary } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import profileMock from '@mocks/vendor-profile.json'
import { useUi } from '@/stores/ui'
import VendorPage from './vendor-page'
import VendorsPage from './vendors-page'

vi.mock('@/api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/api/client')>()
  return { ...mod, api: { GET: vi.fn() } }
})

const profile = profileMock as unknown as VendorProfile

const vendor = (id: string, name: string, city: string, touchless_rate: number | null, open = 0): VendorSummary => ({
  e_invoice_required: false,
  id,
  name,
  gstin: `36${id}GSTIN1Z`,
  city,
  category: 'raw_materials',
  state: 'Telangana',
  payment_terms_days: 30,
  invoices_count: 2,
  exceptions_count: 1,
  open_exceptions: open,
  touchless_rate,
})

const LIST = [
  vendor('V001', 'Shree Balaji Steel Traders Pvt Ltd', 'Hyderabad', 0.5, 1),
  vendor('V002', 'Poona Castings', 'Pune', null),
  vendor('V003', 'Chola Freight', 'Chennai', 0.9),
]

const ok = (data: unknown) => Promise.resolve({ data, response: new Response(null, { status: 200 }) })
const fail = (status: number, detail: string) =>
  Promise.resolve({ error: { detail }, response: new Response(null, { status }) })

type Route = { vendor?: () => Promise<unknown> }
function mockApi(route: Route = {}) {
  vi.mocked(api.GET).mockImplementation(((path: string) => {
    if (path === '/api/vendors') return ok(LIST)
    if (path === '/api/vendors/{vendor_id}') return route.vendor ? route.vendor() : ok(profile)
    if (path === '/api/lessons') return ok([])
    if (path === '/api/settings') return ok({ sim_date: '2026-03-18', memory_enabled: true })
    return fail(404, 'not mocked')
  }) as never)
}

function renderAt(path: string, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed?.(qc)
  const router = createMemoryRouter(
    [
      { path: '/vendors', Component: VendorsPage },
      { path: '/vendors/:id', Component: VendorPage },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return router
}

const vendorRows = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('link')[0].textContent)

beforeEach(() => mockApi())
afterEach(() => {
  cleanup()
  vi.mocked(api.GET).mockReset()
  useUi.setState({ askOpen: false, askVendor: null })
})

describe('Vendors index', () => {
  it('lists every vendor with its touchless rate, or a dash when there is none', async () => {
    renderAt('/vendors')
    expect(await screen.findByText('Shree Balaji Steel Traders Pvt Ltd')).toBeInTheDocument()
    expect(vendorRows()).toHaveLength(3)
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('No touchless rate yet')).toBeInTheDocument()
    expect(screen.getByText('3 vendors · 1 with open cases')).toBeInTheDocument()
  })

  it('sorts from the header, keeps vendors without a rate last, and records the sort in the URL', async () => {
    const router = renderAt('/vendors')
    await screen.findByText('Chola Freight')
    const head = screen.getByRole('columnheader', { name: /touchless/i })
    expect(head).toHaveAttribute('aria-sort', 'none')

    await userEvent.click(within(head).getByRole('button'))
    expect(head).toHaveAttribute('aria-sort', 'descending')
    expect(router.state.location.search).toBe('?sort=touchless.desc')
    expect(vendorRows()).toEqual(['Chola Freight', 'Shree Balaji Steel Traders Pvt Ltd', 'Poona Castings'])

    await userEvent.click(within(head).getByRole('button'))
    expect(head).toHaveAttribute('aria-sort', 'ascending')
    expect(vendorRows()).toEqual(['Shree Balaji Steel Traders Pvt Ltd', 'Chola Freight', 'Poona Castings'])
  })

  it('restores sort and search from the URL', async () => {
    renderAt('/vendors?sort=name.desc&q=c')
    await screen.findByText('Chola Freight')
    expect(screen.getByRole('searchbox')).toHaveValue('c')
    expect(vendorRows()).toEqual(['Poona Castings', 'Chola Freight'])
    expect(screen.getByText('2 of 3 vendors')).toBeInTheDocument()
  })

  it('filters by name, city or GSTIN and says so when nothing matches', async () => {
    const router = renderAt('/vendors')
    const box = await screen.findByRole('searchbox')
    await userEvent.type(box, 'pune')
    expect(vendorRows()).toEqual(['Poona Castings'])
    expect(router.state.location.search).toBe('?q=pune')

    await userEvent.type(box, 'xyz')
    expect(screen.getByText('No vendor matches “punexyz”.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(vendorRows()).toHaveLength(3)
    expect(router.state.location.search).toBe('')
  })

  it('opens the vendor file when a row is clicked', async () => {
    const router = renderAt('/vendors?sort=open.desc')
    const cell = await screen.findByText('Pune · Raw materials')
    await userEvent.click(cell)
    expect(router.state.location.pathname).toBe('/vendors/V002')
    expect(router.state.location.state).toEqual({ back: '?sort=open.desc' })
  })
})

describe('Vendor file', () => {
  const seedList = (qc: QueryClient) => qc.setQueryData(qk.vendors, LIST)

  it('paints the header from the index cache while Hindsight is still answering', async () => {
    mockApi({ vendor: () => new Promise(() => {}) })
    renderAt('/vendors/V003', seedList)
    expect(await screen.findByRole('heading', { name: 'Chola Freight' })).toBeInTheDocument()
    expect(screen.getByText('What Precedent has learned')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing learned yet/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Drafting the playbook/)).not.toBeInTheDocument()
  })

  it('shows what was learned, the trust lane, recent cases, and a pending playbook with a retry', async () => {
    mockApi({ vendor: () => ok({ ...profile, playbook: null }) }) // Hindsight still writing the wiki
    renderAt('/vendors/V001')
    expect((await screen.findAllByText(profile.learned[0].text.slice(0, 40), { exact: false })).length).toBeGreaterThan(0)
    expect(screen.getByText('HDFC Bank')).toBeInTheDocument()
    expect(screen.getByText('HDFC0001234')).toBeInTheDocument()
    const lane = profile.autonomy[0]
    expect(screen.getByText(`${lane.accepted} accepted · ${lane.overruled} overruled · ${lane.auto_resolved} auto`)).toBeInTheDocument()
    expect(screen.getByText(profile.recent[0].id)).toBeInTheDocument()
    expect(screen.getByText('Drafting the playbook…')).toBeInTheDocument()

    const calls = () => (vi.mocked(api.GET).mock.calls as unknown[][]).filter((c) => c[0] === '/api/vendors/{vendor_id}').length
    const before = calls()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(calls()).toBe(before + 1)
  })

  it('renders the playbook once Hindsight has written it', async () => {
    mockApi({ vendor: () => ok({ ...profile, playbook: '## Freight\n\nApprove trips under ₹5,000.' }) })
    renderAt('/vendors/V001')
    expect(await screen.findByRole('heading', { name: 'Freight' })).toBeInTheDocument()
    expect(screen.getByText('Maintained by Hindsight')).toBeInTheDocument()
  })

  it('opens Ask with this vendor filled in', async () => {
    renderAt('/vendors/V001')
    await userEvent.click(await screen.findByRole('button', { name: /ask about this vendor/i }))
    expect(useUi.getState().askOpen).toBe(true)
    expect(useUi.getState().askVendor).toBe('V001')
  })

  it('says plainly when the vendor does not exist', async () => {
    mockApi({ vendor: () => fail(404, 'Vendor not found') })
    renderAt('/vendors/V999')
    expect(await screen.findByText('There’s no vendor called V999.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to vendors/i })).toHaveAttribute('href', '/vendors')
  })

  it('keeps the header and explains the gap when Hindsight is down', async () => {
    mockApi({ vendor: () => fail(503, 'Hindsight unavailable') })
    renderAt('/vendors/V003', seedList)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Hindsight isn’t answering/)
    expect(screen.getByRole('heading', { name: 'Chola Freight' })).toBeInTheDocument()
    expect(screen.getByText('Not available right now')).toBeInTheDocument()
  })
})
