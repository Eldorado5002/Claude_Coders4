import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { qk } from '@/api/keys'
import type { Lesson, MemoryItem, RevokeResult } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import lessonsMock from '@mocks/lessons.json'
import memoryMock from '@mocks/memory-recent.json'
import revokeMock from '@mocks/revoke-result.json'
import { LessonsTab } from './lessons-tab'
import { LoadError } from './memory-states'
import MemoryPage from './memory-page'
import { PolicyTab } from './policy-tab'

const spies = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))
vi.mock('@/api/mutations', () => ({ useRevoke: () => ({ mutate: spies.mutate, isPending: false }) }))
vi.mock('sonner', () => ({ toast: spies.toast }))

const lessons = lessonsMock as unknown as Lesson[]

function renderWith(ui: ReactElement, seed: [QueryKey, unknown][] = [], path = '/memory') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  for (const [key, data] of seed) client.setQueryData(key, data)
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)
beforeEach(() => {
  spies.mutate.mockReset()
  spies.toast.mockReset()
  spies.toast.error.mockReset()
})

describe('LessonsTab', () => {
  it('heads the ledger with counts and groups lessons under day markers', () => {
    renderWith(<LessonsTab onVendor={() => {}} />, [[qk.lessons(), lessons]])
    expect(screen.getByText('8 lessons · 2 taught by the agent itself · 0 revoked')).toBeInTheDocument()
    const days = screen.getAllByRole('heading', { level: 2 })
    expect(days).toHaveLength(5)
    expect(days[0]).toHaveTextContent('Mon, 27 Apr 2026')
  })

  it('shows auto lessons without the boilerplate, as taught by Precedent itself', () => {
    renderWith(<LessonsTab onVendor={() => {}} />, [[qk.lessons(), lessons]])
    expect(screen.getAllByText('taught by Precedent itself')).toHaveLength(2)
    expect(screen.queryByText(/Auto-resolved under earned autonomy/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open case EXC-0046' })).toHaveAttribute('href', '/exceptions/EXC-0046')
  })

  it('strikes a revoked lesson through, says who revoked it, and offers no second revoke', () => {
    const revoked = { ...lessons[1], revoked: true, revoked_by: 'Sneha (AP Lead)', revoke_reason: 'Wrong cap.' }
    renderWith(<LessonsTab onVendor={() => {}} />, [[qk.lessons(), [revoked]]])
    expect(screen.getByText(/Revoked by Sneha \(AP Lead\)/)).toBeInTheDocument()
    expect(screen.getByRole('blockquote')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument()
  })

  it('narrows to one vendor', () => {
    renderWith(<LessonsTab vendor="V005" onVendor={() => {}} />, [[qk.lessons(), lessons]])
    const n = lessons.filter((l) => l.vendor.id === 'V005').length
    expect(screen.getByText(new RegExp(`^${n} lessons? ·`))).toBeInTheDocument()
  })
})

describe('Revoking a lesson', () => {
  it('needs a reason, then revokes as the signed-in clerk and reports what changed', async () => {
    const user = userEvent.setup()
    renderWith(<LessonsTab onVendor={() => {}} />, [[qk.lessons(), [lessons[1]]]])
    await user.click(screen.getByRole('button', { name: /revoke/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Revoke this lesson?')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Why revoke it?'), 'no')
    await user.click(within(dialog).getByRole('button', { name: /revoke lesson/i }))
    expect(within(dialog).getByText(/at least 5 characters/)).toBeInTheDocument()
    expect(spies.mutate).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Why revoke it?'), 't right: cap is ₹5,000')
    await user.click(within(dialog).getByRole('button', { name: /revoke lesson/i }))
    expect(spies.mutate).toHaveBeenCalledWith(
      { caseId: lessons[1].case_id, reason: 'not right: cap is ₹5,000', revoked_by: 'Priya (AP)' },
      expect.anything(),
    )

    const { onSuccess } = spies.mutate.mock.calls[0][1] as { onSuccess: (r: RevokeResult) => void }
    onSuccess(revokeMock as unknown as RevokeResult)
    expect(spies.toast).toHaveBeenCalledWith('Lesson revoked', {
      description: 'Memory deleted · 1 open case will be re-evaluated · trust for Freight reset to suggest',
    })
  })
})

describe('PolicyTab', () => {
  it('shows a calm drafting state while Hindsight is still writing', () => {
    renderWith(<PolicyTab />, [[qk.policy, { content: 'Generating content...\n', refreshed_at: null }]])
    expect(screen.getByText(/Hindsight is drafting the team policy/)).toBeInTheDocument()
  })

  it('renders the policy as prose, badged as Hindsight’s', () => {
    renderWith(<PolicyTab />, [[qk.policy, { content: '## Freight\nApprove under ₹5,000.', refreshed_at: '2026-04-27T09:30:00' }]])
    expect(screen.getByRole('heading', { name: 'Freight' })).toBeInTheDocument()
    expect(screen.getByText('Maintained by Hindsight')).toBeInTheDocument()
    expect(screen.getByText(/Mon, 27 Apr 2026, 09:30/)).toBeInTheDocument()
  })
})

describe('LoadError', () => {
  it('says Hindsight is unreachable on a 503', () => {
    renderWith(<LoadError error={new ApiError(503, 'down')} what="The lessons" onRetry={() => {}} />)
    expect(screen.getByText('Hindsight is unreachable. The ledger returns when memory does.')).toBeInTheDocument()
  })
})

describe('MemoryPage', () => {
  it('opens the tab named in the URL and filters raw memories by kind', () => {
    const items = memoryMock as unknown as MemoryItem[]
    renderWith(
      <MemoryPage />,
      [
        [qk.lessons(), lessons],
        [qk.memoryRecent, items],
        [qk.vendors, []],
      ],
      '/memory?tab=raw&kind=observation',
    )
    expect(screen.getByRole('tab', { name: /raw memories/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('What these are')).toBeInTheDocument()
    const obs = items.filter((m) => m.kind === 'observation').length
    expect(screen.getAllByRole('listitem')).toHaveLength(obs)
  })
})
