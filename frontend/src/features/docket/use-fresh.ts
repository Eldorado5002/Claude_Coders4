import { useEffect, useRef, useState } from 'react'

/**
 * Case ids that arrived while the same view (tab + filters) stayed on screen, so new
 * exceptions can announce themselves. Switching view resets the baseline: no false "new".
 */
export function useFresh(ids: string[], view: string): Set<string> {
  const known = useRef<{ view: string; ids: Set<string> } | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (known.current === null || known.current.view !== view) {
      known.current = { view, ids: new Set(ids) }
      setFresh((f) => (f.size ? new Set() : f))
      return
    }
    const added = ids.filter((id) => !known.current!.ids.has(id))
    if (!added.length) return
    for (const id of added) known.current.ids.add(id)
    setFresh(new Set(added))
    const t = window.setTimeout(() => setFresh(new Set()), 1800)
    return () => window.clearTimeout(t)
  }, [ids, view])

  return fresh
}
