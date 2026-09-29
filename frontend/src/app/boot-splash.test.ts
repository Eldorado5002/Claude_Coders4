import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hideBootSplash, INTRO_MS } from './boot-splash'

const mount = (intro: boolean) => {
  document.body.innerHTML = '<div id="boot-splash"></div>'
  if (intro) document.documentElement.dataset.intro = '1'
  else delete document.documentElement.dataset.intro
  return document.getElementById('boot-splash')!
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  delete document.documentElement.dataset.intro
})

describe('hideBootSplash (index.html splash → the app)', () => {
  it('with reduced motion (no intro), fades out as soon as the app has painted, then leaves the DOM', () => {
    const el = mount(false)
    hideBootSplash(document, 300)
    vi.advanceTimersByTime(0)
    expect(el).toHaveClass('is-done')
    vi.advanceTimersByTime(300)
    expect(document.getElementById('boot-splash')).toBeNull()
  })

  it('lets the ink-in finish before the app shows, but never waits past its end', () => {
    const el = mount(true)
    hideBootSplash(document, 300)
    vi.advanceTimersByTime(INTRO_MS - 300 - 1)
    expect(el).not.toHaveClass('is-done')
    vi.advanceTimersByTime(1)
    expect(el).toHaveClass('is-done')
  })

  it('a slow app waits for nothing: the ink-in is already over', () => {
    const el = mount(true)
    hideBootSplash(document, INTRO_MS + 500)
    vi.advanceTimersByTime(0)
    expect(el).toHaveClass('is-done')
  })

  it('is safe to call twice (StrictMode, shell and error page) and without a splash', () => {
    mount(false)
    hideBootSplash(document, 0)
    hideBootSplash(document, 0)
    vi.advanceTimersByTime(300)
    expect(document.getElementById('boot-splash')).toBeNull()
    expect(() => hideBootSplash(document, 0)).not.toThrow()
  })
})

describe('index.html boot splash', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  const wordmark = readFileSync(resolve(__dirname, '../components/brand/wordmark.tsx'), 'utf8')

  it('paints the same wordmark the app uses, before any script loads', () => {
    const paths = [...wordmark.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
    expect(paths).toHaveLength(2)
    expect(html).toContain('id="boot-splash"')
    for (const d of paths) expect(html).toContain(d)
  })

  it('follows the saved theme and the reduced-motion setting, and plays the intro on every open', () => {
    expect(html).toContain('precedent:theme')
    expect(html).toContain('prefers-reduced-motion')
    expect(html).not.toContain('sessionStorage')
  })

  it('runs for 2 s: the cover and the ◆ stamp both finish inside INTRO_MS, and the app shows at 2 s', () => {
    expect(INTRO_MS).toBe(2000)
    const end = (name: string) => {
      // "boot-stamp 400ms <curve> 1350ms both": duration, then delay
      const m = new RegExp(name + String.raw` (\d+)ms [^;]*? (\d+)ms both`).exec(html)
      expect(m, name).not.toBeNull()
      return Number(m![1]) + Number(m![2])
    }
    const cover = end('boot-uncover')
    const stamp = end('boot-stamp')
    expect(cover).toBeLessThanOrEqual(stamp)
    expect(stamp).toBeLessThanOrEqual(INTRO_MS)
    expect(stamp).toBeGreaterThan(INTRO_MS - 400)
  })
})
