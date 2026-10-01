import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHIME_GAP_MS, CHIME_NOTES, playChime, resetChimeForTests, unlockAudioOnFirstGesture } from './sound'

type Call = { freq: number; start: number; stop: number; peak: number; end: number }

/** A stand-in AudioContext that records what the chime asks it to play. */
function fakeAudio(state: AudioContextState = 'running') {
  const calls: Call[] = []
  const resume = vi.fn(() => Promise.resolve())
  class FakeContext {
    state = state
    currentTime = 10
    destination = {}
    resume = resume
    createOscillator() {
      const call = { freq: 0, start: 0, stop: 0, peak: 0, end: 0 }
      calls.push(call)
      return {
        type: 'sine',
        frequency: {
          set value(v: number) {
            call.freq = v
          },
        },
        connect: (g: unknown) => g,
        start: (t: number) => (call.start = t),
        stop: (t: number) => (call.stop = t),
        _call: call,
      }
    }
    createGain() {
      const call = calls[calls.length - 1]
      const gain = {
        setValueAtTime: (v: number) => (call.peak = v),
        exponentialRampToValueAtTime: (v: number) => (call.end = v),
      }
      return { gain, connect: (d: unknown) => d }
    }
  }
  vi.stubGlobal('AudioContext', FakeContext)
  return { calls, resume }
}

beforeEach(() => resetChimeForTests())
afterEach(() => vi.unstubAllGlobals())

describe('playChime', () => {
  it('plays C5, E5 and G5, 0.1 s apart, fading from 0.3 to 0.01', () => {
    const { calls } = fakeAudio()
    expect(playChime(0)).toBe(true)
    expect(calls.map((c) => c.freq)).toEqual(CHIME_NOTES.map(([f]) => f))
    expect(calls.map((c) => +(c.start - 10).toFixed(2))).toEqual([0, 0.1, 0.2])
    expect(calls.map((c) => +(c.stop - 10).toFixed(2))).toEqual([0.15, 0.25, 0.5])
    expect(calls.every((c) => c.peak === 0.3 && c.end === 0.01)).toBe(true)
  })

  it('a burst of notifications gets one chime', () => {
    const { calls } = fakeAudio()
    expect(playChime(0)).toBe(true)
    expect(playChime(CHIME_GAP_MS - 1)).toBe(false)
    expect(playChime(CHIME_GAP_MS)).toBe(true)
    expect(calls).toHaveLength(6)
  })

  it('wakes a suspended context', () => {
    const { resume } = fakeAudio('suspended')
    playChime(0)
    expect(resume).toHaveBeenCalled()
  })

  it('stays quiet, without throwing, where the browser has no audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(playChime(0)).toBe(false)
  })
})

describe('unlockAudioOnFirstGesture', () => {
  it('opens the audio context on the first click, then stops listening', () => {
    const { resume } = fakeAudio('suspended')
    unlockAudioOnFirstGesture()
    window.dispatchEvent(new Event('pointerdown'))
    expect(resume).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('keydown'))
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
