import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState, type MouseEvent } from 'react'
import { useAsk } from '@/api/mutations'
import { vendorsQ } from '@/api/queries'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useUi } from '@/stores/ui'
import {
  askErrorMessage,
  canAsk,
  conversationReducer,
  hasPending,
  initialConversation,
  shortVendorName,
  suggestionsFor,
} from './ask-model'
import { Composer, ScopeChip, Suggestions, TurnView } from './ask-parts'

const matches = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches
/** Only move focus into the textarea where it won't throw a phone keyboard over the answer. */
const finePointer = () => matches('(pointer: fine)')
const scrollBehavior = (): ScrollBehavior => (matches('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth')

/** Ask Precedent: a right-hand sheet that answers questions from Hindsight memory, with sources. */
export default function AskSheet() {
  const askOpen = useUi((s) => s.askOpen)
  const askVendor = useUi((s) => s.askVendor)
  const askQuestion = useUi((s) => s.askQuestion)
  const closeAsk = useUi((s) => s.closeAsk)

  const vendors = useQuery({ ...vendorsQ(), enabled: !!askVendor })
  const vendorName = askVendor ? vendors.data?.find((v) => v.id === askVendor)?.name : undefined
  const short = vendorName ? shortVendorName(vendorName) : undefined

  const ask = useAsk()
  const [conv, dispatch] = useReducer(conversationReducer, askVendor, initialConversation)
  // A new vendor scope starts a new conversation (before anything below reads it).
  if (conv.scope !== askVendor) dispatch({ type: 'scope', vendorId: askVendor })
  const turns = conv.scope === askVendor ? conv.turns : []
  const pending = hasPending(conv)

  const [draft, setDraft] = useState('')
  const seq = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement | null>(null)

  const send = (id: number, question: string) => {
    ask.mutateAsync({ question, vendor_id: askVendor }).then(
      (answer) => dispatch({ type: 'answer', id, answer }),
      (e: unknown) => dispatch({ type: 'fail', id, error: askErrorMessage(e) }),
    )
  }

  const submit = (raw: string) => {
    const question = raw.trim()
    if (!canAsk(question, pending)) return false
    const id = ++seq.current
    dispatch({ type: 'ask', id, question })
    send(id, question)
    return true
  }

  const retry = (id: number) => {
    const t = turns.find((x) => x.id === id)
    if (!t || pending) return
    dispatch({ type: 'retry', id })
    send(id, t.question)
  }

  // A question typed into ⌘K arrives through the store: take it once (the store is cleared
  // synchronously, so StrictMode's second effect finds nothing), waiting for any answer in flight.
  const takeQuestion = useEffectEvent(() => {
    const q = useUi.getState().askQuestion
    if (!q) return
    useUi.setState({ askQuestion: null })
    submit(q)
  })
  useEffect(() => {
    if (askOpen && askQuestion && !pending) takeQuestion()
  }, [askOpen, askQuestion, pending])

  // Back to the textarea once an answer lands (desktop only).
  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && !pending && askOpen && finePointer()) inputRef.current?.focus()
    wasPending.current = pending
  }, [pending, askOpen])

  // Keep the latest turn in view: follow the question down, then show the answer from its top.
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  const last = turns.at(-1)
  const lastId = last?.id
  const lastStatus = last?.status
  useEffect(() => {
    const el = scroller.current
    if (!el || lastId == null) return
    const node = el.querySelector<HTMLElement>(`[data-turn="${lastId}"]`)
    const top = lastStatus === 'answered' && node ? node.offsetTop - 8 : el.scrollHeight
    el.scrollTo?.({ top, behavior: scrollBehavior() })
  }, [lastId, lastStatus])

  // Footnotes jump within their own answer (ids repeat across turns); case links leave the sheet.
  const onConversationClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest?.('a')
    const href = a?.getAttribute('href') ?? ''
    if (href.startsWith('#cite-')) {
      e.preventDefault()
      a?.closest('[data-turn]')
        ?.querySelector<HTMLElement>(`[id="${href.slice(1)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
    } else if (href.startsWith('/')) {
      closeAsk()
    }
  }

  const removeScope = () => {
    useUi.setState({ askVendor: null })
    if (finePointer()) inputRef.current?.focus()
  }

  return (
    <Sheet open={askOpen} onOpenChange={(o) => !o && closeAsk()}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
        onOpenAutoFocus={(e) => {
          const box = inputRef.current
          if (finePointer() && box && !box.disabled) {
            e.preventDefault()
            box.focus()
          }
        }}
      >
        <SheetHeader className="gap-1 border-b border-rule px-5 pt-5 pr-16 pb-4">
          <SheetTitle className="font-serif serif-display text-[1.6rem] leading-tight font-medium tracking-normal normal-case">
            Ask Precedent
          </SheetTitle>
          <SheetDescription className="mt-0 text-[13px]">
            Answers come from the team’s Hindsight memory, with sources.
          </SheetDescription>
          {askVendor && <ScopeChip id={askVendor} name={vendorName} onRemove={removeScope} />}
        </SheetHeader>

        <div
          ref={attachScroller}
          onClickCapture={onConversationClick}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
        >
          {turns.length === 0 ? (
            <Suggestions items={suggestionsFor(askVendor ? { name: vendorName } : null)} about={short} onPick={submit} />
          ) : (
            <div role="log" aria-label="Conversation with Precedent">
              <ol className="divide-y divide-rule">
                {turns.map((t) => (
                  <TurnView key={t.id} t={t} busy={pending} onRetry={() => retry(t.id)} />
                ))}
              </ol>
            </div>
          )}
        </div>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => submit(draft) && setDraft('')}
          canSend={canAsk(draft, pending)}
          disabled={pending}
          placeholder={short ? `Ask about ${short}…` : 'Ask about a vendor, a rule or a past decision…'}
          inputRef={inputRef}
        />
      </SheetContent>
    </Sheet>
  )
}
