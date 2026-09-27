import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureResponse, resetFixtureState } from './fixtures'
import type { ExceptionDetail, ExceptionPage, Settings } from './types'

describe('fixture mode', () => {
  beforeEach(() => resetFixtureState())

  it('filters the exception list by status like the API does', async () => {
    const page = (await fixtureResponse('GET', '/api/exceptions', { status: 'open' })) as ExceptionPage
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((c) => c.status === 'open')).toBe(true)
    expect(page.total).toBe(page.items.length)
  })

  it('returns a case detail for any listed id, keeping that case identity', async () => {
    const all = (await fixtureResponse('GET', '/api/exceptions', { status: 'all' })) as ExceptionPage
    const pick = all.items[all.items.length - 1]
    const detail = (await fixtureResponse('GET', `/api/exceptions/${pick.id}`)) as ExceptionDetail
    expect(detail.id).toBe(pick.id)
    expect(detail.vendor.id).toBe(pick.vendor.id)
    expect(detail.invoice).toBeTruthy()
  })

  it('remembers the memory toggle across calls', async () => {
    await fixtureResponse('PATCH', '/api/settings', undefined, { memory_enabled: false })
    const s = (await fixtureResponse('GET', '/api/settings')) as Settings
    expect(s.memory_enabled).toBe(false)
  })

  it('answers unknown routes with null (404)', async () => {
    expect(await fixtureResponse('GET', '/api/nope')).toBeNull()
  })
})
