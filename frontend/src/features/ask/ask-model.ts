import { ApiError } from '@/api/client'
import type { Citation, CopilotAnswer } from '@/api/types'

export const MIN_QUESTION = 3

/** "Shree Balaji Steel Traders Pvt Ltd" → "Shree Balaji Steel Traders", for use inside a sentence. */
export function shortVendorName(name: string): string {
  return name.trim().replace(/\s+(pvt\.?\s+ltd\.?|private\s+limited|ltd\.?|limited|llp|co\.?)$/i, '')
}

const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

const GENERAL = [
  'What’s our freight policy for Shree Balaji Steel?',
  'Which vendors bill GST at the wrong rate?',
  'What did we decide about duplicate invoices?',
]

/** Three starter questions: about the vendor in scope, or across all vendors when `scope` is null. */
export function suggestionsFor(scope: { name?: string | null } | null): string[] {
  if (!scope) return GENERAL
  const v = scope.name ? shortVendorName(scope.name) : 'this vendor'
  return [
    `How do we handle ${possessive(v)} freight charges?`,
    `What limits do we apply to ${v}?`,
    `Has ${v} ever changed bank details?`,
  ]
}

export const canAsk = (text: string, pending: boolean) => !pending && text.trim().length >= MIN_QUESTION

export const answeredIn = (latencyMs: number) => `Answered from memory in ${(latencyMs / 1000).toFixed(1)} s`

export function askErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'Hindsight is unreachable right now, so there’s no memory to answer from.'
    if (e.status === 0) return 'Can’t reach the Precedent API.'
  }
  if (e instanceof Error && e.message) return e.message
  return 'Something went wrong.'
}

export type Turn = {
  id: number
  question: string
  status: 'pending' | 'answered' | 'failed'
  answer?: string
  citations?: Citation[]
  latency_ms?: number
  error?: string
}

/** One conversation per vendor scope (null = all vendors). */
export type Conversation = { scope: string | null; turns: Turn[] }

export type ConversationAction =
  | { type: 'scope'; vendorId: string | null }
  | { type: 'ask'; id: number; question: string }
  | { type: 'answer'; id: number; answer: CopilotAnswer }
  | { type: 'fail'; id: number; error: string }
  | { type: 'retry'; id: number }

export const initialConversation = (scope: string | null): Conversation => ({ scope, turns: [] })

export const hasPending = (s: Conversation) => s.turns.some((t) => t.status === 'pending')

function patch(s: Conversation, id: number, when: (t: Turn) => boolean, next: (t: Turn) => Turn): Conversation {
  const i = s.turns.findIndex((t) => t.id === id)
  if (i < 0 || !when(s.turns[i])) return s
  const turns = s.turns.slice()
  turns[i] = next(s.turns[i])
  return { ...s, turns }
}

export function conversationReducer(s: Conversation, a: ConversationAction): Conversation {
  switch (a.type) {
    case 'scope':
      return a.vendorId === s.scope ? s : initialConversation(a.vendorId)
    case 'ask':
      if (s.turns.some((t) => t.id === a.id)) return s
      return { ...s, turns: [...s.turns, { id: a.id, question: a.question, status: 'pending' }] }
    case 'answer':
      return patch(
        s,
        a.id,
        (t) => t.status === 'pending',
        (t) => ({
          id: t.id,
          question: t.question,
          status: 'answered',
          answer: a.answer.answer,
          citations: a.answer.citations,
          latency_ms: a.answer.latency_ms,
        }),
      )
    case 'fail':
      return patch(
        s,
        a.id,
        (t) => t.status === 'pending',
        (t) => ({ id: t.id, question: t.question, status: 'failed', error: a.error }),
      )
    case 'retry':
      return patch(
        s,
        a.id,
        (t) => t.status === 'failed',
        (t) => ({ id: t.id, question: t.question, status: 'pending' }),
      )
  }
}
