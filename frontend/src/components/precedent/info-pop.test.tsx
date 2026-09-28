import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { InfoPop } from './info-pop'

const realMatchMedia = window.matchMedia
function pointer(canHover: boolean) {
  window.matchMedia = ((media: string) => ({
    matches: canHover,
    media,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function Example() {
  return (
    <>
      <InfoPop trigger={<button type="button">58 high</button>}>
        <p>Risk signals</p>
        <a href="/risk">All vendors by risk</a>
      </InfoPop>
      <button type="button">elsewhere</button>
    </>
  )
}

afterEach(() => {
  cleanup()
  window.matchMedia = realMatchMedia
})

describe('InfoPop', () => {
  it('opens from the keyboard and lets Tab reach the link inside', async () => {
    pointer(true)
    const user = userEvent.setup()
    render(<Example />)
    screen.getByRole('button', { name: '58 high' }).focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Risk signals')).toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('link', { name: 'All vendors by risk' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Risk signals')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '58 high' })).toHaveFocus()
  })

  it('opens on tap where there is no hover', async () => {
    pointer(false)
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('button', { name: '58 high' }))
    expect(await screen.findByText('Risk signals')).toBeInTheDocument()
  })

  it('opens on mouse hover without taking focus, and closes when the mouse leaves', async () => {
    pointer(true)
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole('button', { name: '58 high' })
    await user.hover(trigger)
    expect(await screen.findByText('Risk signals')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All vendors by risk' })).not.toHaveFocus()
    await user.unhover(trigger)
    await user.hover(screen.getByRole('button', { name: 'elsewhere' }))
    await expect.poll(() => screen.queryByText('Risk signals')).toBeNull()
  })

  it('a click while hover-open pins it, so moving away keeps it open', async () => {
    pointer(true)
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole('button', { name: '58 high' })
    await user.hover(trigger)
    await screen.findByText('Risk signals')
    await user.click(trigger)
    await user.unhover(trigger)
    await new Promise((r) => setTimeout(r, 250))
    expect(screen.getByText('Risk signals')).toBeInTheDocument()
  })
})
