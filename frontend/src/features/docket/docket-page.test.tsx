import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import type { ExceptionPage } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import msmeListMock from '@mocks/twist/exceptions-by-msme-deadline.json'
import DocketPage from './docket-page'

vi.mock('@/api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/api/client')>()
  return { ...mod, api: { GET: vi.fn() } }
})

const page = msmeListMock as unknown as ExceptionPage
const ok = (data: unknown) => Promise.resolve({ data, response: new Response(null, { status: 200 }) })
const fail = (status: number) => Promise.resolve({ error: { detail: 'not mocked' }, response: new Response(null, { status }) })

type Opts = { params?: { query?: Record<string, unknown> } }
const sortsRequested = () =>
  (vi.mocked(api.GET).mock.calls as unknown as [string, Opts | undefined][])
    .filter(([path]) => path === '/api/exceptions')
    .map(([, o]) => o?.params?.query?.sort)

beforeAll(() => {
  // phone layout: the list pane without the resizable split (jsdom has no matchMedia)
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  window.matchMedia ??= ((q: string) => ({
    matches: true,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  vi.mocked(api.GET).mockImplementation(((path: string) => {
    if (path === '/api/exceptions') return ok(page)
    if (path === '/api/settings') return ok({ sim_date: '2026-04-27', memory_enabled: true })
    if (path === '/api/vendors') return ok([])
    return fail(404)
  }) as never)
})
afterEach(() => vi.mocked(api.GET).mockReset())

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const router = createMemoryRouter([{ path: '/exceptions', Component: DocketPage }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return router
}

const rowIds = async () => {
  const nav = await screen.findByRole('navigation', { name: 'Exceptions' })
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href')!.split('/').pop()!.split('?')[0])
}

describe('DocketPage sort', () => {
  it('reads ?sort=msme_deadline, asks the API for it and keeps its order: EXC-0041 (5 days) first', async () => {
    renderAt('/exceptions?sort=msme_deadline')
    expect(await rowIds()).toEqual(['EXC-0041', 'EXC-0039', 'EXC-0037', 'EXC-0038', 'EXC-0040', 'EXC-0042'])
    expect(sortsRequested()).toContain('msme_deadline')
    expect(screen.getByRole('radio', { name: 'MSME deadline' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('MSME · 5d')).toBeInTheDocument()
  })

  it('stores the chosen sort in the URL, and drops it again for the default', async () => {
    const user = userEvent.setup()
    const router = renderAt('/exceptions')
    await rowIds()
    expect(sortsRequested()).toEqual(['newest'])
    await user.click(screen.getByRole('radio', { name: 'MSME deadline' }))
    expect(router.state.location.search).toBe('?sort=msme_deadline')
    await user.click(screen.getByRole('radio', { name: 'Newest' }))
    expect(router.state.location.search).toBe('')
  })

  it('floats hard controls first when sorted by amount', async () => {
    renderAt('/exceptions?sort=amount')
    const ids = await rowIds()
    expect(ids.slice(0, 4)).toEqual(['EXC-0039', 'EXC-0037', 'EXC-0038', 'EXC-0040'])
    expect(sortsRequested()).toContain('amount')
  })
})
