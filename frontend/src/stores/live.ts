import { create } from 'zustand'

/** Connection + simulator state shared by the shell (not persisted). */
type Live = {
  sse: 'connecting' | 'open' | 'closed' | 'off'
  simBusy: boolean
  simTarget: string | null
}

export const useLive = create<Live>(() => ({ sse: 'connecting', simBusy: false, simTarget: null }))
