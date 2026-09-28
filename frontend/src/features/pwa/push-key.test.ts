import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from './push-key'

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key without padding', () => {
    // "hello" = aGVsbG8 in base64url (no padding)
    expect([...urlBase64ToUint8Array('aGVsbG8')]).toEqual([104, 101, 108, 108, 111])
  })
  it('maps the url-safe alphabet back to standard base64', () => {
    // bytes 251,255 → standard "+/8=" → url-safe "-_8"
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255])
  })
})
