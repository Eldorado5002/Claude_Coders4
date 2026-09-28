import { describe, expect, it } from 'vitest'
import { ApiError, unwrap } from './client'

const res = (status: number) => new Response(null, { status })

describe('unwrap', () => {
  it('returns data on success', async () => {
    await expect(unwrap(Promise.resolve({ data: { ok: 1 }, response: res(200) }))).resolves.toEqual({ ok: 1 })
  })
  it('throws the FastAPI detail message with its status', async () => {
    const p = unwrap(Promise.resolve({ error: { detail: 'EXC-0014 is already resolved' }, response: res(409) }))
    await expect(p).rejects.toMatchObject({ status: 409, detail: 'EXC-0014 is already resolved' })
    await expect(p).rejects.toBeInstanceOf(ApiError)
  })
  it('joins validation errors into one readable message', async () => {
    const error = { detail: [{ msg: 'String should have at least 5 characters' }, { msg: 'Field required' }] }
    await expect(unwrap(Promise.resolve({ error, response: res(422) }))).rejects.toMatchObject({
      status: 422,
      detail: 'String should have at least 5 characters; Field required',
    })
  })
  it('reports an unreachable API as status 0', async () => {
    await expect(unwrap(Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ status: 0 })
  })
})
