import type { Action } from '@/api/types'

/**
 * The backend writes fixed sentences into a recommendation's rationale:
 *   "Hard control: {issue message} Action forced to {action}. (Memory alone would have suggested {action}.)"
 *   "Hard control: {issue message} {model rationale}"            (model already agreed)
 *   "{rationale} ML check: this invoice is more unusual than …"  (anomaly note)
 * Splitting them lets the UI show each part in its own place.
 */
export type ParsedRationale = {
  body: string
  control?: { message: string; forced?: Action }
  memoryWouldHave?: Action
  ml?: string
}

const HARD = 'Hard control: '
const ML = 'ML check: '

export function parseRationale(text: string, controlMessages: string[] = []): ParsedRationale {
  let rest = text.trim()
  let ml: string | undefined

  const mlAt = rest.startsWith(ML) ? 0 : rest.indexOf(` ${ML}`)
  if (mlAt >= 0) {
    ml = rest.slice(mlAt + (mlAt === 0 ? ML.length : ML.length + 1)).trim()
    rest = rest.slice(0, mlAt).trim()
  }

  const out: ParsedRationale = { body: rest }
  if (rest.startsWith(HARD)) {
    let after = rest.slice(HARD.length)
    let message: string
    const known = controlMessages.find((m) => m && after.startsWith(m))
    if (known) {
      message = known
      after = after.slice(known.length).trim()
    } else {
      const m = after.match(/^(.*?)\s*Action forced to \w+\./)
      message = (m ? m[1] : after).trim()
      after = m ? after.slice(m[1].length).trim() : ''
    }
    const control: NonNullable<ParsedRationale['control']> = { message }
    const forced = after.match(/^Action forced to (\w+)\.\s*/)
    if (forced) {
      control.forced = forced[1] as Action
      after = after.slice(forced[0].length)
    }
    const memory = after.match(/\(Memory alone would have suggested (\w+)\.\)/)
    if (memory) {
      out.memoryWouldHave = memory[1] as Action
      after = after.replace(memory[0], '')
    }
    out.control = control
    out.body = after.trim()
  }
  if (ml) out.ml = ml
  return out
}
