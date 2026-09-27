import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CLERKS = ['Priya (AP)', 'Rahul (AP)', 'Sneha (AP Lead)', 'Arjun (AP)'] as const

type Ui = {
  clerk: string
  presenter: boolean
  narratorsSeen: string[]
  commandOpen: boolean
  askOpen: boolean
  askVendor: string | null
  askQuestion: string | null
  setClerk: (clerk: string) => void
  togglePresenter: () => void
  seeNarrator: (stage: string) => void
  resetNarrators: () => void
  setCommandOpen: (open: boolean) => void
  openAsk: (opts?: { vendorId?: string | null; question?: string | null }) => void
  closeAsk: () => void
}

export const useUi = create<Ui>()(
  persist(
    (set) => ({
      clerk: CLERKS[0],
      presenter: false,
      narratorsSeen: [],
      commandOpen: false,
      askOpen: false,
      askVendor: null,
      askQuestion: null,
      setClerk: (clerk) => set({ clerk }),
      togglePresenter: () => set((s) => ({ presenter: !s.presenter })),
      seeNarrator: (stage) =>
        set((s) => ({ narratorsSeen: s.narratorsSeen.includes(stage) ? s.narratorsSeen : [...s.narratorsSeen, stage] })),
      resetNarrators: () => set({ narratorsSeen: [] }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      openAsk: (opts) =>
        set({ askOpen: true, commandOpen: false, askVendor: opts?.vendorId ?? null, askQuestion: opts?.question ?? null }),
      closeAsk: () => set({ askOpen: false }),
    }),
    {
      name: 'precedent:ui',
      partialize: (s) => ({ clerk: s.clerk, presenter: s.presenter, narratorsSeen: s.narratorsSeen }),
    },
  ),
)
