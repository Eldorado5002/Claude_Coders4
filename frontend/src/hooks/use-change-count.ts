import { useState } from 'react'

/**
 * How many times `value` has changed since mount: 0 on the first render, so opening a page doesn't animate but a
 * live change does. Also a handy `key` to replay an entrance on each change.
 */
export function useChangeCount<T>(value: T): number {
  const [prev, setPrev] = useState(value)
  const [count, setCount] = useState(0)
  // React's "store the previous value in state" pattern: adjusts during render, no effect, no extra paint
  if (!Object.is(prev, value)) {
    setPrev(value)
    setCount(count + 1)
  }
  return count
}
