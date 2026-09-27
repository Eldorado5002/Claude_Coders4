import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, unwrap } from './client'
import { qk, type ExceptionFilters } from './keys'

export const settingsQ = () =>
  queryOptions({ queryKey: qk.settings, queryFn: () => unwrap(api.GET('/api/settings')) })

export const healthQ = () =>
  queryOptions({
    queryKey: qk.health,
    queryFn: () => unwrap(api.GET('/api/health')),
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
  })

export const demoQ = () => queryOptions({ queryKey: qk.demo, queryFn: () => unwrap(api.GET('/api/demo/state')) })

export const exceptionsQ = (f: ExceptionFilters) =>
  queryOptions({
    queryKey: qk.exceptions(f),
    queryFn: () =>
      unwrap(
        api.GET('/api/exceptions', {
          params: { query: { status: f.status ?? 'open', vendor_id: f.vendor_id, type: f.type, limit: 300 } },
        }),
      ),
    placeholderData: keepPreviousData,
  })

/** A case, in one memory mode. Polls while its recommendation is still being written (SSE backup). */
export const exceptionQ = (id: string, memOn: boolean) =>
  queryOptions({
    queryKey: qk.exception(id, memOn),
    queryFn: () => unwrap(api.GET('/api/exceptions/{case_id}', { params: { path: { case_id: id } } })),
    refetchInterval: (q) => {
      const d = q.state.data
      return d && d.status === 'open' && !d.recommendation ? 3000 : false
    },
  })

export const vendorsQ = () => queryOptions({ queryKey: qk.vendors, queryFn: () => unwrap(api.GET('/api/vendors')) })

export const vendorQ = (id: string) =>
  queryOptions({
    queryKey: qk.vendor(id),
    queryFn: () => unwrap(api.GET('/api/vendors/{vendor_id}', { params: { path: { vendor_id: id } } })),
  })

export const autonomyQ = () => queryOptions({ queryKey: qk.autonomy, queryFn: () => unwrap(api.GET('/api/autonomy')) })

export const metricsQ = () => queryOptions({ queryKey: qk.metrics, queryFn: () => unwrap(api.GET('/api/metrics')) })

export const memoryRecentQ = () =>
  queryOptions({
    queryKey: qk.memoryRecent,
    queryFn: () => unwrap(api.GET('/api/memory/recent', { params: { query: { limit: 60 } } })),
    retry: false,
  })

export const lessonsQ = (vendorId?: string) =>
  queryOptions({
    queryKey: qk.lessons(vendorId),
    queryFn: () =>
      unwrap(api.GET('/api/lessons', { params: { query: { vendor_id: vendorId, include_revoked: true, limit: 200 } } })),
  })

export const policyQ = () =>
  queryOptions({
    queryKey: qk.policy,
    queryFn: () => unwrap(api.GET('/api/memory/policy')),
    retry: false,
    // Hindsight writes the policy in the background; look again while it's pending
    refetchInterval: (q) => (q.state.data && !q.state.data.content?.trim().startsWith('Generating') ? false : 15_000),
  })
