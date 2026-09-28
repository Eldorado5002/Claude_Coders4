import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExceptionPage } from '@/api/types'
import msmeListMock from '@mocks/twist/exceptions-by-msme-deadline.json'
import { renderApp } from '@/test/render'
import { CaseRow } from './case-row'
import { DocketSort } from './docket-sort'

const items = (msmeListMock as unknown as ExceptionPage).items
const byId = (id: string) => items.find((c) => c.id === id)!

describe('CaseRow MSME chip', () => {
  it('shows "MSME · 5d" in hold tone for the Twist micro supplier', () => {
    renderApp(<CaseRow c={byId('EXC-0041')} to="/exceptions/EXC-0041" active={false} fresh={false} />)
    const chip = screen.getByText('MSME · 5d').parentElement!
    expect(chip).toHaveClass('text-hold')
    expect(chip).toHaveAttribute('title', '5 days to the MSME 43B(h) payment deadline')
  })

  it('stays neutral when the deadline is weeks away', () => {
    renderApp(<CaseRow c={byId('EXC-0039')} to="/exceptions/EXC-0039" active={false} fresh={false} />)
    const chip = screen.getByText('MSME · 37d').parentElement!
    expect(chip).not.toHaveClass('text-hold')
    expect(chip).toHaveClass('text-muted-foreground')
  })

  it('turns reject and says overdue once the deadline has passed', () => {
    renderApp(<CaseRow c={{ ...byId('EXC-0041'), msme_days_left: -2 }} to="/x" active={false} fresh={false} />)
    expect(screen.getByText('MSME · 2d overdue').parentElement).toHaveClass('text-reject')
  })

  it('shows no chip for a vendor that is not MSME', () => {
    renderApp(<CaseRow c={byId('EXC-0037')} to="/exceptions/EXC-0037" active={false} fresh={false} />)
    expect(screen.queryByText(/MSME/)).not.toBeInTheDocument()
  })
})

describe('DocketSort', () => {
  it('offers Newest · MSME deadline · Amount at risk and reports the choice', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderApp(<DocketSort value="newest" onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Newest' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'MSME deadline' }))
    expect(onChange).toHaveBeenCalledWith('msme_deadline')
    await user.click(screen.getByRole('radio', { name: 'Amount at risk' }))
    expect(onChange).toHaveBeenCalledWith('amount')
  })

  it('ignores a click on the sort already chosen (a single sort is always on)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderApp(<DocketSort value="msme_deadline" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'MSME deadline' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
