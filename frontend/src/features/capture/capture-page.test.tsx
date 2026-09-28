import { queryOptions } from '@tanstack/react-query'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { CaptureResult, VendorSummary } from '@/api/types'
import captureMock from '@mocks/capture-result.json'
import noIrnMock from '@mocks/twist/capture-no-irn.json'
import vendorsMock from '@mocks/vendors.json'
import { renderApp } from '@/test/render'
import CapturePage from './capture-page'

const { mutationFn } = vi.hoisted(() => ({ mutationFn: vi.fn<(f: File) => Promise<CaptureResult>>() }))

vi.mock('@/api/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query')
  return { useCapture: () => useMutation({ mutationFn: (f: File) => mutationFn(f) }) }
})
// the page warms the vendor list while Gemini reads (it says which vendors must e-invoice)
vi.mock('@/api/queries', async (orig) => ({
  ...(await orig<typeof import('@/api/queries')>()),
  vendorsQ: () => queryOptions({ queryKey: ['vendors'], queryFn: async () => vendorsMock as unknown as VendorSummary[] }),
}))

afterEach(() => {
  cleanup()
  mutationFn.mockReset()
  vi.unstubAllGlobals()
})

function snap(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[capture]')!
  fireEvent.change(input, { target: { files: [file] } })
}

const png = () => new File([new Uint8Array(2048)], 'invoice.png', { type: 'image/png' })

describe('CapturePage', () => {
  it('offers the camera, a file picker and clearly labelled samples', () => {
    renderApp(<CapturePage />)
    expect(screen.getByRole('heading', { name: 'Snap an invoice. Precedent does the rest.' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /take photo/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /choose file/i }).length).toBeGreaterThan(0)
    const picker = screen.getByRole('group', { name: /use a sample invoice/i })
    expect(within(picker).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Freight · within the agreed cap',
      'No IRN · e-invoice control',
      'Bad GSTIN · GSTIN control',
    ])
    expect(picker).toHaveTextContent(/freight one twice/i)
  })

  it('a sample is fetched from /samples, captured as that file, and its control named', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array(2048)], { type: 'image/png' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    mutationFn.mockResolvedValue(noIrnMock as unknown as CaptureResult)
    renderApp(<CapturePage />)
    fireEvent.click(screen.getByRole('button', { name: 'No IRN · e-invoice control' }))
    expect(await screen.findByRole('button', { name: /capture another/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/samples/invoice-balaji-no-irn.png')
    const sent = mutationFn.mock.calls[0][0]
    expect(sent).toBeInstanceOf(File)
    expect(sent.name).toBe('invoice-balaji-no-irn.png')
    expect(await screen.findAllByText('Held: no e-invoice IRN.')).not.toHaveLength(0)
  })

  it('says so when a sample can’t be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob() })))
    renderApp(<CapturePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Bad GSTIN · GSTIN control' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the sample invoice. Choose a file instead.')
    expect(mutationFn).not.toHaveBeenCalled()
  })

  it('refuses a HEIC photo in the browser, before uploading anything', () => {
    const { container } = renderApp(<CapturePage />)
    snap(container, new File(['x'], 'IMG_0412.heic', { type: 'image/heic' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use a JPG, PNG, WEBP or PDF.')
    expect(mutationFn).not.toHaveBeenCalled()
  })

  it('reads the photo, then opens the new case', async () => {
    let finish: (r: CaptureResult) => void = () => {}
    mutationFn.mockImplementation(() => new Promise((r) => (finish = r)))
    const { container } = renderApp(<CapturePage />)
    snap(container, png())
    expect(await screen.findByText('Reading the invoice…')).toBeInTheDocument()
    expect(screen.getByText('invoice.png')).toBeInTheDocument()
    finish(captureMock as unknown as CaptureResult)
    expect(await screen.findByRole('link', { name: /open case/i })).toHaveAttribute('href', `/exceptions/${captureMock.exception_id}`)
  })

  it('413: plain message and no retry with the same file', async () => {
    mutationFn.mockRejectedValue(new ApiError(413, 'File too large (max 12 MB)'))
    const { container } = renderApp(<CapturePage />)
    snap(container, png())
    expect(await screen.findByText('That file is over 12 MB.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('502: shows the reason and retries the same file', async () => {
    mutationFn.mockRejectedValueOnce(new ApiError(502, 'Could not read the invoice: timeout'))
    mutationFn.mockResolvedValueOnce({ ...(captureMock as unknown as CaptureResult), status: 'matched', exception_id: null })
    const { container } = renderApp(<CapturePage />)
    const file = png()
    snap(container, file)
    expect(await screen.findByText('Couldn’t read that invoice: timeout')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('button', { name: /capture another/i })).toBeInTheDocument()
    // the banner, plus the polite live region that announces it
    expect(screen.getAllByText('Clean 3-way match. Queued for payment.')).toHaveLength(2)
    expect(mutationFn).toHaveBeenCalledTimes(2)
    expect(mutationFn.mock.calls[1][0]).toBe(file)
  })
})
