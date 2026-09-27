import { useCallback, useEffect, useRef, useState } from 'react'
import { isPdf } from './capture-logic'

/**
 * A preview URL for the chosen file. Set it from the event that picked the file; the previous URL is
 * revoked on every change and the last one on unmount. PDFs get none (they show a document card).
 */
export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null)
  const current = useRef<string | null>(null)

  const setFile = useCallback((file: File | null) => {
    if (current.current) URL.revokeObjectURL(current.current)
    current.current = file && !isPdf(file) ? URL.createObjectURL(file) : null
    setUrl(current.current)
  }, [])

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current)
      current.current = null
    },
    [],
  )

  return [url, setFile] as const
}
