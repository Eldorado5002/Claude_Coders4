import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AutonomyCertificate, Calibration, Metrics, Performance } from '@/api/types'
import collectingCert from '@mocks/certificate.json'
import metricsMock from '@mocks/metrics.json'
import certifiedCert from '@mocks/replay-end/certificate.json'
import calibrationMock from '@mocks/replay-end/calibration.json'
import performanceMock from '@mocks/replay-end/performance.json'
import { renderApp } from '@/test/render'
import { TrustSection } from './trust-section'

const week3 = metricsMock as unknown as Metrics
const replayEnd: Metrics = {
  ...week3,
  certificate: certifiedCert as AutonomyCertificate,
  calibration: calibrationMock as Calibration,
  performance: performanceMock as Performance,
}
const paused: AutonomyCertificate = {
  ...(certifiedCert as AutonomyCertificate),
  status: 'paused',
  threshold: null,
  errors: 5,
  error_upper_bound: 0.1403,
  explanation: 'Wrong payments crossed the target, so auto-approval is paused.',
}

const certificate = () => screen.getByRole('article', { name: /auto-pay/i })

describe('TrustSection', () => {
  it('is the #trust anchor the trust map links to', () => {
    const { container } = renderApp(<TrustSection m={replayEnd} />)
    expect(container.querySelector('#trust')).toHaveTextContent('Trust you can check')
  })

  it('stamps a certified certificate and lays out its ladder', () => {
    renderApp(<TrustSection m={replayEnd} />)
    const card = certificate()
    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Auto-pay allowed at confidence ≥ 0.75')
    expect(within(card).getByText('Certified', { selector: 'span' })).toBeInTheDocument()
    expect(card).toHaveTextContent('73 verified payment decisions · 0 wrong')
    expect(card).toHaveTextContent('With 95% confidence, at most 4.0% of automatic payments are wrong (target 5%)')
    expect(card).toHaveTextContent('46 paid automatically · 0 wrong')
    expect(within(card).getByText(/^Of 73 verified pay recommendations/)).toBeInTheDocument()

    const ladder = within(card).getByRole('table')
    const rows = within(ladder).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('≥ 0.95')
    expect(rows[0]).toHaveTextContent('4.4%')
    expect(within(ladder).getAllByLabelText('Certified')).toHaveLength(5)
    const inForce = rows.filter((r) => r.getAttribute('aria-current') === 'true')
    expect(inForce).toHaveLength(1)
    expect(inForce[0]).toHaveTextContent('≥ 0.75')
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows progress instead of a one-row ladder while collecting', () => {
    renderApp(<TrustSection m={week3} />)
    const card = certificate()
    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Provisional: auto-pay only at confidence ≥ 0.95')
    expect(within(card).getByText('Collecting')).toBeInTheDocument()
    expect(card).toHaveTextContent('2 verified payment decisions · 0 wrong')
    expect(card).toHaveTextContent('Nothing paid automatically yet')
    expect(within(card).getByRole('progressbar', { name: 'Verified decisions toward certification' })).toHaveAttribute(
      'aria-valuetext',
      '2 of 59 verified decisions',
    )
    expect(within(card).queryByRole('table')).not.toBeInTheDocument()
    expect(card).toHaveTextContent(collectingCert.explanation)
  })

  it('says plainly when auto-pay is paused', () => {
    renderApp(<TrustSection m={{ ...replayEnd, certificate: paused }} />)
    const card = certificate()
    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Auto-pay is paused')
    expect(within(card).getByText('Paused')).toBeInTheDocument()
    expect(within(card).queryAllByRole('row').some((r) => r.getAttribute('aria-current'))).toBe(false)
  })

  it('draws calibration with its error figure and a table of every scored band', () => {
    renderApp(<TrustSection m={replayEnd} />)
    const fig = screen.getByRole('figure', { name: 'Does its confidence mean what it says?' })
    expect(within(fig).getByText('Expected calibration error 0.07')).toBeInTheDocument()
    expect(within(fig).getByText('Right 90% of the time across 123 scored recommendations')).toBeInTheDocument()
    expect(within(fig).getByText('View as table')).toBeInTheDocument()
    // every non-empty band is listed, including the one too small to score
    const rows = within(within(fig).getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    expect(within(fig).getByText('Too few to score')).toBeInTheDocument()
  })

  it('says so when no band has enough scored decisions to plot', () => {
    renderApp(<TrustSection m={week3} />)
    const fig = screen.getByRole('figure', { name: 'Does its confidence mean what it says?' })
    expect(within(fig).getByText('Not enough scored decisions in any band yet to check calibration.')).toBeInTheDocument()
    expect(within(fig).queryByText('View as table')).not.toBeInTheDocument()
    expect(within(fig).queryByText(/Expected calibration error/)).not.toBeInTheDocument()
    expect(within(fig).getByText('Right 67% of the time across 4 scored recommendations')).toBeInTheDocument()
  })

  it('omits the calibration error when the API has none', () => {
    renderApp(<TrustSection m={{ ...replayEnd, calibration: { ...(calibrationMock as Calibration), ece: null } }} />)
    expect(screen.queryByText(/Expected calibration error/)).not.toBeInTheDocument()
  })

  it('shows cost and speed as figures', () => {
    renderApp(<TrustSection m={replayEnd} />)
    const cost = screen.getByRole('region', { name: 'Cost and speed' })
    for (const label of ['Cost per 1,000 exceptions', 'On the fast path', 'Time to a recommendation', 'Recommendations'])
      expect(within(cost).getByText(label)).toBeInTheDocument()
    expect(within(cost).getByText('$0.017 a recommendation')).toBeInTheDocument()
    expect(within(cost).getByText('2.7 s median · 9.4 s p95')).toBeInTheDocument()
  })

  it('hides each block that has no data, and the whole section when none do', () => {
    renderApp(<TrustSection m={{ ...replayEnd, certificate: null }} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Does its confidence mean what it says?' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cost and speed' })).toBeInTheDocument()
  })

  it('renders nothing without any trust data', () => {
    const { container } = renderApp(<TrustSection m={{ ...replayEnd, certificate: null, calibration: null, performance: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
