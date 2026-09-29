import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Command, CommandDialog, CommandInput } from './command'

describe('CommandDialog (⌘K)', () => {
  it('opens and closes instantly: a keyboard palette used all day never animates', () => {
    render(
      <CommandDialog open title="Precedent" description="Jump anywhere">
        <Command>
          <CommandInput placeholder="Search" />
        </Command>
      </CommandDialog>,
    )
    const content = document.querySelector('[data-slot="dialog-content"]')!
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument()
    for (const el of [content, overlay]) {
      expect(el.className).not.toMatch(/(^|\s)data-open:animate-in(\s|$)/)
      expect(el.className).not.toMatch(/(^|\s)data-closed:animate-out(\s|$)/)
    }
  })
})
