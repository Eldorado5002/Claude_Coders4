import { queryOptions } from '@tanstack/react-query'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { CopilotAnswer, VendorSummary } from '@/api/types'
import answerMock from '@mocks/copilot-answer.json'
import vendorsMock from '@mocks/vendors.json'
import { useUi } from '@/stores/ui'
import { renderApp } from '@/test/render'
import AskSheet from './ask-sheet'

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('@/api/mutations', () => ({ useAsk: () => ({ mutateAsync }) }))
vi.mock('@/api/queries', async (orig) => ({
  ...(await orig<typeof import('@/api/queries')>()),
  vendorsQ: () => queryOptions({ queryKey: ['vendors'], queryFn: async () => vendorsMock as VendorSummary[] }),
}))

const answer = answerMock as CopilotAnswer
const open = (opts?: { vendorId?: string | null; question?: string | null }) => act(() => useUi.getState().openAsk(opts))

beforeEach(() => {
  mutateAsync.mockReset()
  useUi.setState({ askOpen: false, askVendor: null, askQuestion: null })
})
afterEach(() => {
  cleanup()
  useUi.setState({ askOpen: false, askVendor: null, askQuestion: null })
})

describe('AskSheet', () => {
  it('offers three questions across all vendors before anything is asked', () => {
    renderApp(<AskSheet />)
    open()
    expect(screen.getByRole('heading', { name: /Ask Precedent/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What’s our freight policy for Shree Balaji Steel?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Which vendors bill GST at the wrong rate?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What did we decide about duplicate invoices?' })).toBeInTheDocument()
  })

  it('scopes to a vendor, then drops the scope with ×', async () => {
    const user = userEvent.setup()
    renderApp(<AskSheet />)
    open({ vendorId: 'V001' })
    expect(await screen.findByRole('button', { name: 'How do we handle Shree Balaji Steel Traders’ freight charges?' })).toBeInTheDocument()
    expect(screen.getByText('Shree Balaji Steel Traders Pvt Ltd')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ask across all vendors' }))
    expect(useUi.getState().askVendor).toBeNull()
    expect(screen.getByRole('button', { name: 'Which vendors bill GST at the wrong rate?' })).toBeInTheDocument()
  })

  it('asks a suggested question and shows the answer, its sources and the latency', async () => {
    const user = userEvent.setup()
    let resolve!: (a: CopilotAnswer) => void
    mutateAsync.mockReturnValue(new Promise<CopilotAnswer>((r) => (resolve = r)))
    renderApp(<AskSheet />)
    open({ vendorId: 'V001' })

    await user.click(await screen.findByRole('button', { name: 'Has Shree Balaji Steel Traders ever changed bank details?' }))
    expect(mutateAsync).toHaveBeenCalledWith({ question: 'Has Shree Balaji Steel Traders ever changed bank details?', vendor_id: 'V001' })
    expect(screen.getByText('Reflecting on memory…')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /question/i })).toBeDisabled()

    await act(async () => resolve(answer))
    expect(screen.getByText('Answered from memory in 3.1 s')).toBeInTheDocument()
    expect(screen.getByText('Precedents cited')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Precedent 1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Precedent 2' })).toBeInTheDocument()
    expect(screen.queryByText('Reflecting on memory…')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /question/i })).toBeEnabled()
  })

  it('submits a question from ⌘K exactly once, even under StrictMode, then clears it', async () => {
    mutateAsync.mockResolvedValue(answer)
    useUi.setState({ askOpen: true, askVendor: null, askQuestion: 'What limits do we apply?' })
    renderApp(
      <StrictMode>
        <AskSheet />
      </StrictMode>,
    )
    await screen.findByText('Answered from memory in 3.1 s')
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({ question: 'What limits do we apply?', vendor_id: null })
    expect(useUi.getState().askQuestion).toBeNull()
    expect(screen.getAllByText('What limits do we apply?')).toHaveLength(1)
  })

  it('explains a Hindsight outage and tries again in place', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValueOnce(new ApiError(503, 'Service Unavailable')).mockResolvedValueOnce(answer)
    renderApp(<AskSheet />)
    open({ question: 'Which vendors bill GST at the wrong rate?' })

    expect(await screen.findByText('Hindsight is unreachable right now, so there’s no memory to answer from.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    await screen.findByText('Answered from memory in 3.1 s')
    expect(mutateAsync).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('Which vendors bill GST at the wrong rate?')).toHaveLength(1)
  })

  it('says so when the API itself is unreachable', async () => {
    mutateAsync.mockRejectedValueOnce(new ApiError(0, 'Cannot reach the Precedent API'))
    renderApp(<AskSheet />)
    open({ question: 'Freight policy?' })
    expect(await screen.findByText('Can’t reach the Precedent API.')).toBeInTheDocument()
  })

  it('sends on Enter, keeps Shift+Enter for a new line, and ignores questions under 3 characters', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(answer)
    renderApp(<AskSheet />)
    open()
    const box = screen.getByRole('textbox', { name: /question/i })

    await user.type(box, 'ab{Enter}')
    expect(mutateAsync).not.toHaveBeenCalled()

    await user.clear(box)
    await user.type(box, 'Freight rules{Shift>}{Enter}{/Shift}for Balaji?')
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(box).toHaveValue('Freight rules\nfor Balaji?')

    await user.type(box, '{Enter}')
    expect(mutateAsync).toHaveBeenCalledWith({ question: 'Freight rules\nfor Balaji?', vendor_id: null })
    await screen.findByText('Answered from memory in 3.1 s')
    expect(box).toHaveValue('')
  })

  it('keeps the conversation across close and reopen, and clears it when the vendor scope changes', async () => {
    mutateAsync.mockResolvedValue(answer)
    renderApp(<AskSheet />)
    open({ question: 'Freight policy?' })
    await screen.findByText('Answered from memory in 3.1 s')

    act(() => useUi.getState().closeAsk())
    act(() => useUi.setState({ askOpen: true }))
    expect(screen.getByText('Freight policy?')).toBeInTheDocument()

    open({ vendorId: 'V001' })
    await waitFor(() => expect(screen.queryByText('Freight policy?')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'What limits do we apply to Shree Balaji Steel Traders?' })).toBeInTheDocument()
  })

  it('jumps a footnote to the source in its own answer, and closes when a cited case is opened', async () => {
    const user = userEvent.setup()
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    try {
      mutateAsync.mockResolvedValue(answer)
      renderApp(<AskSheet />)
      open({ question: 'First question?' })
      await screen.findByText('Answered from memory in 3.1 s')
      await user.type(screen.getByRole('textbox', { name: /question/i }), 'Second question?{Enter}')
      await waitFor(() => expect(screen.getAllByText('Answered from memory in 3.1 s')).toHaveLength(2))

      const second = document.querySelector('[data-turn="2"]')!
      await user.click(second.querySelector('a[href="#cite-1"]')!)
      expect(scrolled).toHaveLength(1)
      expect(scrolled[0].id).toBe('cite-1')
      expect(second.contains(scrolled[0])).toBe(true)

      await user.click(screen.getAllByRole('link', { name: 'EXC-0007 →' })[0])
      expect(useUi.getState().askOpen).toBe(false)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
