import { describe, expect, it } from 'vitest'
import { ACTION_META, KIND_META, TYPE_LABEL, confidenceBand, isHardControl, isPendingContent } from './labels'

describe('labels', () => {
  it('names exception types for humans', () => {
    expect(TYPE_LABEL.freight_charge).toBe('Freight')
    expect(TYPE_LABEL.tax_mismatch).toBe('GST mismatch')
    expect(TYPE_LABEL.over_threshold).toBe('Over ₹5L')
  })
  it('gives every action a label and a tone', () => {
    expect(ACTION_META.approve).toMatchObject({ label: 'Approve', tone: 'approve' })
    expect(ACTION_META.approve_adjusted).toMatchObject({ label: 'Approve adjusted', tone: 'adjusted' })
    expect(ACTION_META.escalate.tone).toBe('escalate')
  })
  it('explains memory kinds in plain language', () => {
    expect(KIND_META.observation.label).toBe('Learned pattern')
    expect(KIND_META.mental_model.label).toBe('Playbook')
    expect(KIND_META.directive.tip.length).toBeGreaterThan(10)
  })
  it('marks the four hard controls', () => {
    expect(isHardControl('bank_details_changed')).toBe(true)
    expect(isHardControl('freight_charge')).toBe(false)
  })
})

describe('confidenceBand', () => {
  it('bands scores at 80 and 50', () => {
    expect(confidenceBand(0.95)).toEqual({ band: 'High', score: 95 })
    expect(confidenceBand(0.8)).toEqual({ band: 'High', score: 80 })
    expect(confidenceBand(0.79)).toEqual({ band: 'Medium', score: 79 })
    expect(confidenceBand(0.5)).toEqual({ band: 'Medium', score: 50 })
    expect(confidenceBand(0.4)).toEqual({ band: 'Low', score: 40 })
  })
})

describe('isPendingContent', () => {
  it('treats empty and Hindsight placeholder text as pending', () => {
    expect(isPendingContent(null)).toBe(true)
    expect(isPendingContent(undefined)).toBe(true)
    expect(isPendingContent('   ')).toBe(true)
    expect(isPendingContent('Generating content...\n')).toBe(true)
  })
  it('keeps real markdown', () => {
    expect(isPendingContent('### Balaji playbook\n- Freight under ₹5,000')).toBe(false)
  })
})
