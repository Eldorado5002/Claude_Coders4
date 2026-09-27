import { describe, expect, it } from 'vitest'
import type { Citation } from '@/api/types'
import { memoryCount, usableCitations } from './citations'

const c = (kind: Citation['kind'], text: string): Citation => ({ id: text, kind, text, occurred_at: null, exception_id: null })

describe('usableCitations', () => {
  it('drops a playbook Hindsight is still writing', () => {
    const cites = [c('observation', 'Balaji freight under ₹5,000 is approved.'), c('mental_model', 'Generating content...\n')]
    expect(usableCitations(cites).map((x) => x.kind)).toEqual(['observation'])
  })
  it('counts only memories as precedents, not policy directives', () => {
    const cites = [c('world', 'Priya approved SBST/1.'), c('directive', 'Bank change: escalate.'), c('mental_model', 'Generating content...')]
    expect(memoryCount(cites)).toBe(1)
  })
})
