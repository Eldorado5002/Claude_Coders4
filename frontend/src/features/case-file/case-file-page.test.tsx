import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import type { ExceptionDetail, Settings } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import memoryOnMock from '@mocks/exception-detail.json'
import memoryOffMock from '@mocks/exception-detail-memory-off.json'
import settingsMock from '@mocks/settings.json'
import CaseFilePage from './case-file-page'

// NumberFlow's custom element can't update inside happy-dom; a plain number stands in (browsers get the roll)
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }))

vi.mock('@/api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/api/client')>()
  return { ...mod, api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }
})

const memoryOn = memoryOnMock as unknown as ExceptionDetail
const memoryOff = memoryOffMock as unknown as ExceptionDetail
const settings = { ...(settingsMock as unknown as Settings), memory_enabled: true }
const ok = (data: unknown) => Promise.resolve({ data, response: new Response(null, { status: 200 }) })

afterEach(() => {
  cleanup()
  vi.mocked(api.GET).mockReset()
})

describe('Case file when memory is switched', () => {
  it('keeps the case on screen, dims the verdict while it re-runs, then shows the new one and the diff', async () => {
    let memoryOnNow = true
    let answerOff: (v: unknown) => void = () => {}
    vi.mocked(api.GET).mockImplementation(((path: string) => {
      if (path === '/api/settings') return ok({ ...settings, memory_enabled: memoryOnNow })
      if (path === '/api/exceptions/{case_id}') return memoryOnNow ? ok(memoryOn) : new Promise((r) => (answerOff = r))
      return Promise.resolve({ error: { detail: 'not mocked' }, response: new Response(null, { status: 404 }) })
    }) as never)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    const router = createMemoryRouter([{ path: '/exceptions/:id', Component: CaseFilePage }], {
      initialEntries: [`/exceptions/${memoryOn.id}`],
    })
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(await screen.findByRole('button', { name: /Accept/ })).toBeInTheDocument()

    // flip memory off: the other verdict is still being fetched
    memoryOnNow = false
    qc.setQueryData(qk.settings, { ...settings, memory_enabled: false })
    expect(await screen.findByText('Re-running with memory off…')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading)
    expect(screen.queryByRole('button', { name: /Accept/ })).not.toBeInTheDocument()

    answerOff({ data: memoryOff, response: new Response(null, { status: 200 }) })
    expect(await screen.findByText('Memory changed this verdict')).toBeInTheDocument()
    expect(screen.queryByText('Re-running with memory off…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Accept · Hold/ })).toBeInTheDocument()
  })
})
