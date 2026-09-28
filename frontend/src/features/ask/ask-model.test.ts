import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { CopilotAnswer } from '@/api/types'
import answerMock from '@mocks/copilot-answer.json'
import {
  answeredIn,
  askErrorMessage,
  canAsk,
  conversationReducer,
  hasPending,
  initialConversation,
  shortVendorName,
  suggestionsFor,
  type Conversation,
} from './ask-model'

const answer = answerMock as CopilotAnswer

const asked = (...qs: string[]): Conversation =>
  qs.reduce((s, q, i) => conversationReducer(s, { type: 'ask', id: i + 1, question: q }), initialConversation(null))

describe('shortVendorName', () => {
  it('drops the legal suffix so the name reads naturally in a sentence', () => {
    expect(shortVendorName('Shree Balaji Steel Traders Pvt Ltd')).toBe('Shree Balaji Steel Traders')
    expect(shortVendorName('Southern Grid Power Services Ltd')).toBe('Southern Grid Power Services')
    expect(shortVendorName('Godavari Polymers LLP')).toBe('Godavari Polymers')
    expect(shortVendorName('Bharat Fasteners Co.')).toBe('Bharat Fasteners')
    expect(shortVendorName('Acme Private Limited')).toBe('Acme')
  })

  it('leaves names without a suffix alone', () => {
    expect(shortVendorName('Metro Office Mart')).toBe('Metro Office Mart')
    expect(shortVendorName('  Kaveri Packaging Industries ')).toBe('Kaveri Packaging Industries')
  })
})

describe('suggestionsFor', () => {
  it('offers three questions across all vendors when nothing is in scope', () => {
    expect(suggestionsFor(null)).toEqual([
      'What’s our freight policy for Shree Balaji Steel?',
      'Which vendors bill GST at the wrong rate?',
      'What did we decide about duplicate invoices?',
    ])
  })

  it('asks about the vendor in scope, using its short name', () => {
    expect(suggestionsFor({ name: 'Metro Office Mart' })).toEqual([
      'How do we handle Metro Office Mart’s freight charges?',
      'What limits do we apply to Metro Office Mart?',
      'Has Metro Office Mart ever changed bank details?',
    ])
  })

  it('writes the possessive of a name ending in s without a second s', () => {
    expect(suggestionsFor({ name: 'Shree Balaji Steel Traders Pvt Ltd' })[0]).toBe(
      'How do we handle Shree Balaji Steel Traders’ freight charges?',
    )
  })

  it('falls back to "this vendor" while the name is still loading', () => {
    expect(suggestionsFor({ name: undefined })).toEqual([
      'How do we handle this vendor’s freight charges?',
      'What limits do we apply to this vendor?',
      'Has this vendor ever changed bank details?',
    ])
  })
})

describe('canAsk', () => {
  it('needs at least three characters, ignoring surrounding space', () => {
    expect(canAsk('ab', false)).toBe(false)
    expect(canAsk('  ab  ', false)).toBe(false)
    expect(canAsk('abc', false)).toBe(true)
  })

  it('refuses while another answer is being written', () => {
    expect(canAsk('What limits apply?', true)).toBe(false)
  })
})

describe('answeredIn', () => {
  it('shows the latency in seconds with one decimal', () => {
    expect(answeredIn(3120)).toBe('Answered from memory in 3.1 s')
    expect(answeredIn(800)).toBe('Answered from memory in 0.8 s')
    expect(answeredIn(12000)).toBe('Answered from memory in 12.0 s')
  })
})

describe('askErrorMessage', () => {
  it('explains a Hindsight outage', () => {
    expect(askErrorMessage(new ApiError(503, 'Service Unavailable'))).toBe(
      'Hindsight is unreachable right now, so there’s no memory to answer from.',
    )
  })

  it('explains an unreachable API', () => {
    expect(askErrorMessage(new ApiError(0, 'Cannot reach the Precedent API'))).toBe('Can’t reach the Precedent API.')
  })

  it('passes other errors through', () => {
    expect(askErrorMessage(new ApiError(422, 'question: too short'))).toBe('question: too short')
    expect(askErrorMessage(new Error('boom'))).toBe('boom')
    expect(askErrorMessage('nope')).toBe('Something went wrong.')
  })
})

describe('conversationReducer', () => {
  it('adds a question as a pending turn at the bottom', () => {
    const s = asked('First?', 'Second?')
    expect(s.turns.map((t) => [t.id, t.question, t.status])).toEqual([
      [1, 'First?', 'pending'],
      [2, 'Second?', 'pending'],
    ])
  })

  it('ignores a repeated ask with the same id (StrictMode double effects)', () => {
    const s = conversationReducer(asked('First?'), { type: 'ask', id: 1, question: 'First?' })
    expect(s.turns).toHaveLength(1)
  })

  it('fills in the answer, citations and latency', () => {
    const s = conversationReducer(asked('Freight?'), { type: 'answer', id: 1, answer })
    expect(s.turns[0]).toMatchObject({
      status: 'answered',
      answer: answer.answer,
      citations: answer.citations,
      latency_ms: answer.latency_ms,
    })
    expect(hasPending(s)).toBe(false)
  })

  it('records a failure and lets it be retried in place', () => {
    const failed = conversationReducer(asked('Freight?'), { type: 'fail', id: 1, error: 'down' })
    expect(failed.turns[0]).toMatchObject({ status: 'failed', error: 'down' })
    expect(hasPending(failed)).toBe(false)

    const retried = conversationReducer(failed, { type: 'retry', id: 1 })
    expect(retried.turns).toHaveLength(1)
    expect(retried.turns[0].status).toBe('pending')
    expect(retried.turns[0].error).toBeUndefined()
    expect(hasPending(retried)).toBe(true)
  })

  it('does not retry a turn that did not fail', () => {
    const s = asked('Freight?')
    expect(conversationReducer(s, { type: 'retry', id: 1 })).toBe(s)
  })

  it('drops answers for turns that are gone (scope changed mid-flight)', () => {
    const s = asked('Freight?')
    expect(conversationReducer(s, { type: 'answer', id: 99, answer })).toBe(s)
    expect(conversationReducer(s, { type: 'fail', id: 99, error: 'x' })).toBe(s)
  })

  it('keeps the conversation when the scope is unchanged', () => {
    const s = asked('Freight?')
    expect(conversationReducer(s, { type: 'scope', vendorId: null })).toBe(s)
  })

  it('clears the conversation when the vendor scope changes', () => {
    const s = conversationReducer(asked('Freight?'), { type: 'scope', vendorId: 'V001' })
    expect(s).toEqual({ scope: 'V001', turns: [] })
    const back = conversationReducer(conversationReducer(s, { type: 'ask', id: 5, question: 'Limits?' }), {
      type: 'scope',
      vendorId: null,
    })
    expect(back).toEqual({ scope: null, turns: [] })
  })

  it('reports whether an answer is still being written', () => {
    expect(hasPending(initialConversation(null))).toBe(false)
    expect(hasPending(asked('Freight?'))).toBe(true)
  })
})
