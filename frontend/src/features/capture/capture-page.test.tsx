import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { CaptureResult } from '@/api/types'
import captureMock from '@mocks/capture-result.json'
import { renderApp } from '@/test/render'
import CapturePage from './capture-page'

const { mutationFn } = vi.hoisted(() => ({ mutationFn: vi.fn<(f: File) => Promise<CaptureResult>>() }))

vi.mock('@/api/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query')
  return { useCapture: () => useMutation({ mutationFn: (f: File) => mutationFn(f) }) }
})

afterEach(() => {
  cleanup()
  mutationFn.mockReset()
})

function snap(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[capture]')!
  fireEvent.change(input, { target: { files: [file] } })
}

const png = () => new File([new Uint8Array(2048)], 'invoice.png', { type: 'image/png' })

describe('CapturePage', () => {
  it('offers the camera, a file picker and a clearly labelled sample', () => {
    renderApp(<CapturePage />)
    expect(screen.getByRole('heading', { name: 'Snap an invoice. Precedent does the rest.' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /take photo/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /choose file/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /use sample invoice/i })).toBeInTheDocument()
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
