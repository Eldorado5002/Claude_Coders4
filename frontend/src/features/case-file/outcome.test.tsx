import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ResolveResult } from '@/api/types'
import resolveMock from '@mocks/resolve-result.json'
import { renderApp } from '@/test/render'
import { LessonCard } from './outcome'

const promoted = resolveMock as unknown as ResolveResult
// the decision before the one that earns autonomy: 2 of 3, still suggesting
const secondInARow: ResolveResult = {
  ...promoted,
  promoted: false,
  demoted: false,
  autonomy: { ...promoted.autonomy, level: 'suggest', streak: 2 },
}

describe('LessonCard', () => {
  it('fills in the trust dot this decision just earned, after the card lands', () => {
    renderApp(<LessonCard result={secondInARow} />)
    expect(screen.getByText('2 of 3 to auto')).toBeInTheDocument()
    const earned = document.querySelectorAll('[data-just-earned]')
    expect(earned).toHaveLength(1)
    // the empty ring stays put; only the ink inside it fills in
    expect(earned[0].querySelector('.animate-fill-in')).not.toBeNull()
    // it is the second dot: the one this decision added
    const dots = earned[0].parentElement!.children
    expect([...dots].indexOf(earned[0])).toBe(1)
  })

  it('stamps AUTO instead when the decision earns autonomy, and marks no dot', () => {
    renderApp(<LessonCard result={promoted} />)
    expect(screen.getByText('Auto')).toBeInTheDocument()
    expect(document.querySelector('[data-just-earned]')).toBeNull()
  })
})
