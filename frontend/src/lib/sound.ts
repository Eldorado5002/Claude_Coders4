/** The notification chime: C5 → E5 → G5 sine notes, 0.1 s apart, 0.5 s in all. Generated, so there's no file to load. */
export const CHIME_NOTES: [freq: number, offset: number, duration: number][] = [
  [523.25, 0, 0.15],
  [659.25, 0.1, 0.15],
  [783.99, 0.2, 0.3],
]
/** A burst of notifications gets one chime, not a pile-up of them. */
export const CHIME_GAP_MS = 1000

let ctx: AudioContext | null = null
let last = Number.NEGATIVE_INFINITY

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC() // one context for every chime
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Browsers keep audio locked until the first click or key press; open it then, so later chimes play. */
export function unlockAudioOnFirstGesture(): () => void {
  const off = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  const unlock = () => {
    context()
    off()
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return off
}

/** Play the chime unless one just played. Returns whether it played. */
export function playChime(now: number = performance.now()): boolean {
  if (now - last < CHIME_GAP_MS) return false
  const ac = context()
  if (!ac) return false
  last = now
  try {
    const t0 = ac.currentTime
    for (const [freq, offset, duration] of CHIME_NOTES) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.3, t0 + offset)
      gain.gain.exponentialRampToValueAtTime(0.01, t0 + offset + duration)
      osc.connect(gain).connect(ac.destination)
      osc.start(t0 + offset)
      osc.stop(t0 + offset + duration)
    }
    return true
  } catch {
    return false // a browser that refuses audio shouldn't break a notification
  }
}

export function resetChimeForTests() {
  ctx = null
  last = Number.NEGATIVE_INFINITY
}
