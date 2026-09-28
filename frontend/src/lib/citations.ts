import type { Citation } from '@/api/types'
import { isPendingContent } from './labels'

/** Citations worth showing: drop mental models Hindsight is still writing ("Generating content..."). */
export function usableCitations(cites: Citation[]): Citation[] {
  return cites.filter((c) => !isPendingContent(c.text))
}

/** "Grounded in N precedents": memories only, not policy directives or pending playbooks. */
export function memoryCount(cites: Citation[]): number {
  return usableCitations(cites).filter((c) => c.kind !== 'directive').length
}
