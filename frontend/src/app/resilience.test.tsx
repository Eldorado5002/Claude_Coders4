import { renderHook, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { useReset } from '@/api/mutations'
import { Safe } from '@/components/precedent/safe'
import { useUi } from '@/stores/ui'
import demoState from '@mocks/demo-state.json'
import { routes } from './router'

describe('resilience', () => {
  it('keeps the shell when one page throws: pages sit under their own error boundary', () => {
    const shell = routes[0]
    expect(shell.children).toHaveLength(1)
    const pages = shell.children![0]
    expect(pages.errorElement).toBeTruthy()
    expect(pages.children?.some((r) => r.path === 'exceptions')).toBe(true)
  })

  it('shows a local fallback instead of blanking the app when a block fails to render', () => {
    const Boom = () => {
      throw new Error('bad markdown')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>sidebar</p>
        <Safe label="The opinion">
          <Boom />
        </Safe>
      </div>,
    )
    expect(screen.getByText('sidebar')).toBeInTheDocument()
    expect(screen.getByText(/The opinion couldn’t render/)).toBeInTheDocument()
  })

  it('brings the narrator cards back after “Reset demo”', async () => {
    useUi.setState({ narratorsSeen: ['day1', 'week3', 'week8', 'twist'] })
    vi.spyOn(api, 'POST').mockResolvedValue({ data: demoState, response: new Response(null, { status: 200 }) } as never)
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useReset(), { wrapper })
    await result.current.mutateAsync()
    await waitFor(() => expect(useUi.getState().narratorsSeen).toEqual([]))
  })
})
