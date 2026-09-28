/** VAPID public keys arrive base64url-encoded; PushManager wants raw bytes. */
export function urlBase64ToUint8Array(key: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (key.length % 4)) % 4)
  const b64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
