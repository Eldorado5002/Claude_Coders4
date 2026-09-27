import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '@/api/types'
import captureMock from '@mocks/capture-result.json'
import { renderApp } from '@/test/render'
import { CaptureResultView } from './capture-result'

const result = captureMock as unknown as CaptureResult

afterEach(cleanup)

describe('CaptureResultView', () => {
  it('opens the new case and shows what was read, matched to the vendor master', () => {
    renderApp(<CaptureResultView result={result} onReset={() => {}} />)
    expect(screen.getByRole('link', { name: /open case/i })).toHaveAttribute('href', '/exceptions/EXC-0140')
    expect(screen.getByText('Shree Balaji Steel Traders Pvt Ltd')).toBeInTheDocument()
    expect(screen.getByText('36AAECS4821K1Z3')).toBeInTheDocument()
    expect(screen.getByText(/Matched to vendor master/)).toBeInTheDocument()
    expect(screen.getByText('SBST/2526/1231')).toBeInTheDocument()
    expect(screen.getByText('PO-2026-0081')).toBeInTheDocument()
    expect(screen.getByText('MS Plate 10mm IS2062 E250')).toBeInTheDocument()
    expect(screen.getByText('XXXXXX4521')).toBeInTheDocument()
    expect(screen.getByText('HDFC0001234')).toBeInTheDocument()
  })

  it('says a clean match is queued for payment, with no case to open', () => {
    renderApp(<CaptureResultView result={{ ...result, status: 'matched', exception_id: null }} onReset={() => {}} />)
    expect(screen.getByText('Clean 3-way match. Queued for payment.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open case/i })).toBeNull()
  })

  it('flags an unknown vendor and a missing PO', () => {
    renderApp(
      <CaptureResultView
        result={{ ...result, status: 'unknown_vendor', vendor: null, exception_id: null, extracted: { ...result.extracted, po_number: null } }}
        onReset={() => {}}
      />,
    )
    expect(screen.getByText(/This vendor isn’t in the vendor master/)).toBeInTheDocument()
    expect(screen.queryByText(/Matched to vendor master/)).toBeNull()
    expect(screen.getByText('No PO')).toBeInTheDocument()
  })

  it('resets for another capture', () => {
    const onReset = vi.fn()
    renderApp(<CaptureResultView result={result} onReset={onReset} />)
    screen.getByRole('button', { name: /capture another/i }).click()
    expect(onReset).toHaveBeenCalledOnce()
  })
})
