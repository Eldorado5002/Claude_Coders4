import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/**
 * Scroll to the element named by the URL hash (e.g. /learning#trust) once the page has rendered it.
 * The page loads its data first, so the browser's own jump to the anchor happens too early to land.
 * Runs once per navigation.
 */
export function useHashScroll(ready: boolean) {
  const { hash, key } = useLocation()
  const done = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !hash || done.current === key) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!el) return
    done.current = key
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [ready, hash, key])
}
