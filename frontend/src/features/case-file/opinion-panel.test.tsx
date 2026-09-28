import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ExceptionDetail, Recommendation } from '@/api/types'
import detailMock from '@mocks/exception-detail.json'
import hardControlMock from '@mocks/twist/exception-detail-hard-control.json'
import { renderApp } from '@/test/render'
import { OpinionPanel } from './opinion-panel'

const detail = detailMock as unknown as ExceptionDetail
const hardControl = hardControlMock as unknown as ExceptionDetail

describe('OpinionPanel', () => {
  it('shows the reasoning state instead of crashing while the recommendation is being written', () => {
    renderApp(<OpinionPanel c={{ ...detail, status: 'open', recommendation: null }} />)
    expect(screen.getByText(/Recalling/i)).toBeInTheDocument()
  })

  it('shows the decision, confidence band and cited precedents', () => {
    renderApp(<OpinionPanel c={detail} />)
    const rec = detail.recommendation!
    expect(screen.getAllByText(/approve/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/High/)).toBeInTheDocument()
    expect(screen.getByText('Precedents cited')).toBeInTheDocument()
    expect(rec.citations.length).toBeGreaterThan(0)
  })

  it('inverts for a hard control and shows what memory alone would have done', () => {
    const msg = 'Pay-to account Yes Bank XXXXXX9083 (YESB0000871) differs from vendor master HDFC Bank XXXXXX4521 (HDFC0001234).'
    const rec: Recommendation = {
      ...detail.recommendation!,
      action: 'escalate',
      source: 'guardrail',
      confidence: 0.99,
      rationale: `Hard control: ${msg} Action forced to escalate. (Memory alone would have suggested approve.)`,
    }
    renderApp(
      <OpinionPanel
        c={{
          ...detail,
          blocking: true,
          issues: [{ type: 'bank_details_changed', message: msg, blocking: true }],
          recommendation: rec,
        }}
      />,
    )
    expect(screen.getByText(msg)).toBeInTheDocument()
    expect(screen.getByText(/Memory alone would have said/i)).toBeInTheDocument()
  })

  it('lets Enter on a focused Overrule button overrule, instead of hijacking it to accept', async () => {
    const user = userEvent.setup()
    renderApp(<OpinionPanel c={{ ...detail, status: 'open' }} />)
    screen.getByRole('button', { name: /Overrule/ }).focus()
    await user.keyboard('{Enter}')
    const radios = await screen.findAllByRole('radio')
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('footer tells the cost story: route, cost and latency (Week 3: fast path, about $0.001)', () => {
    renderApp(<OpinionPanel c={detail} />)
    expect(screen.getByText('Fast path')).toBeInTheDocument()
    expect(screen.getByText('$0.001')).toBeInTheDocument()
    expect(screen.getByText('2.0 s')).toBeInTheDocument()
    expect(screen.getByText(detail.recommendation!.provider)).toBeInTheDocument()
  })

  it('puts the calibrated track record next to the confidence band, and omits it when unknown', () => {
    const { unmount } = renderApp(<OpinionPanel c={detail} />)
    expect(screen.getByText('right 67% of the time at this confidence')).toBeInTheDocument()
    unmount()
    const early: Recommendation = { ...detail.recommendation!, calibrated_confidence: null, cost_usd: null }
    renderApp(<OpinionPanel c={{ ...detail, recommendation: early }} />)
    expect(screen.queryByText(/of the time at this confidence/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('renders the Twist hard control inverted: forced action and "Memory alone would have said ~~Approve~~"', () => {
    renderApp(<OpinionPanel c={hardControl} />)
    const control = hardControl.issues.find((i) => i.blocking)!.message
    expect(screen.getByText(control)).toBeInTheDocument()
    expect(screen.getByText(/Action forced to/)).toHaveTextContent('Action forced to escalate.')
    expect(screen.getByText(/Memory alone would have said/)).toBeInTheDocument()
    expect(screen.getByText('Approve', { selector: 's' })).toBeInTheDocument()
    expect(screen.getAllByText('Hard control').length).toBeGreaterThan(1) // source chip + route
  })

  it('does not count or show a playbook Hindsight is still writing', () => {
    const rec: Recommendation = {
      ...detail.recommendation!,
      source: 'memory',
      citations: [
        detail.recommendation!.citations[0],
        { id: 'mm', kind: 'mental_model', text: 'Generating content...', occurred_at: null, exception_id: null },
      ],
    }
    renderApp(<OpinionPanel c={{ ...detail, recommendation: rec }} />)
    expect(screen.getByText('Grounded in 1 precedent')).toBeInTheDocument()
    expect(screen.queryByText(/Generating content/)).not.toBeInTheDocument()
  })
})
