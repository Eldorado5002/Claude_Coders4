import { useEffect } from 'react'

/**
 * The opening runs 2 s on every open: the paper cover slides off the wordmark (150 ms delay + 1200 ms), the ◆
 * stamps (1350 ms delay + 400 ms), and the app shows at 2 s. Keep in step with index.html (a test checks).
 */
export const INTRO_MS = 2000
/** Longest the fade can take before the splash leaves the DOM anyway (reduced motion, no transitionend). */
const LEAVE_MS = 300

/**
 * Hand over from the splash painted by index.html to the app: it fades out (150 ms) once the app has painted and
 * the opening has run (INTRO_MS from page start; a slower app waits for nothing). With reduced motion there is no
 * opening, so it leaves at once. Safe to call more than once.
 */
export function hideBootSplash(doc: Document = document, sinceStart: number = performance.now()) {
  const el = doc.getElementById('boot-splash')
  if (!el || el.dataset.leaving) return
  el.dataset.leaving = 'true'
  const wait = doc.documentElement.dataset.intro ? Math.max(0, INTRO_MS - sinceStart) : 0
  window.setTimeout(() => {
    el.classList.add('is-done')
    const remove = () => el.remove()
    el.addEventListener('transitionend', remove, { once: true })
    window.setTimeout(remove, LEAVE_MS)
  }, wait)
}

/** Mount in whatever the first real screen is: the shell, or the error page. */
export function useBootSplashDone() {
  useEffect(() => hideBootSplash(), [])
}
