import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ExceptionDetail, Recommendation } from '@/api/types'
import detailMock from '@mocks/exception-detail.json'
import { renderApp } from '@/test/render'
import { OpinionPanel } from './opinion-panel'

const detail = detailMock as unknown as ExceptionDetail

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
})
