import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLive } from '@/stores/live'
import { api, unwrap } from './client'
import { qk } from './keys'
import type { DemoStageId, ResolveRequest, Settings } from './types'

/** Memory switch. We wait for the server before switching the cache key, so a
 *  case is never stored under the wrong memory mode. */
export function useSetMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => unwrap(api.PATCH('/api/settings', { body: { memory_enabled: on } })),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings, s)
      void qc.invalidateQueries({ queryKey: qk.exceptionsAll })
    },
  })
}

function memOn(qc: ReturnType<typeof useQueryClient>) {
  return qc.getQueryData<Settings>(qk.settings)?.memory_enabled ?? true
}

export function useResolve(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ResolveRequest) =>
      unwrap(api.POST('/api/exceptions/{case_id}/resolve', { params: { path: { case_id: caseId } }, body })),
    onSuccess: (r) => {
      qc.setQueryData(qk.exception(caseId, memOn(qc)), r.exception)
      for (const key of [qk.exceptionsAll, qk.autonomy, qk.metrics, qk.lessonsAll, qk.vendors, qk.vendor(r.exception.vendor.id)])
        void qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useRecommend(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/exceptions/{case_id}/recommend', { params: { path: { case_id: caseId } } })),
    onSuccess: (d) => {
      qc.setQueryData(qk.exception(caseId, memOn(qc)), d)
      void qc.invalidateQueries({ queryKey: qk.exceptionsAll })
    },
  })
}

export function useRevoke() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { caseId: string; reason: string; revoked_by: string }) =>
      unwrap(
        api.POST('/api/lessons/{case_id}/revoke', {
          params: { path: { case_id: v.caseId } },
          body: { reason: v.reason, revoked_by: v.revoked_by },
        }),
      ),
    onSuccess: () => {
      for (const key of [qk.lessonsAll, qk.autonomy, qk.exceptionsAll, qk.exceptionAll, qk.metrics, qk.vendorAll, qk.memoryAll])
        void qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useAdvance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stage: DemoStageId) => unwrap(api.POST('/api/demo/advance', { body: { stage } })),
    onMutate: (stage) => useLive.setState({ simBusy: true, simTarget: stage }),
    onSuccess: (s) => {
      qc.setQueryData(qk.demo, s)
      void qc.invalidateQueries()
    },
    onSettled: () => useLive.setState({ simBusy: false, simTarget: null }),
  })
}

export function useReset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/demo/reset')),
    onMutate: () => useLive.setState({ simBusy: true, simTarget: 'day1' }),
    onSuccess: (s) => {
      qc.setQueryData(qk.demo, s)
      void qc.invalidateQueries()
    },
    onSettled: () => useLive.setState({ simBusy: false, simTarget: null }),
  })
}

export function useCapture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return unwrap(
        api.POST('/api/invoices/capture', {
          body: {} as never,
          bodySerializer: () => fd,
        }),
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.exceptionsAll })
      void qc.invalidateQueries({ queryKey: qk.metrics })
    },
  })
}

export function useAsk() {
  return useMutation({
    mutationFn: (v: { question: string; vendor_id?: string | null }) =>
      unwrap(api.POST('/api/copilot/ask', { body: { question: v.question, vendor_id: v.vendor_id ?? null } })),
  })
}
