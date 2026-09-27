import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { lessonsQ, memoryRecentQ } from '@/api/queries'
import { PageHeader } from '@/components/precedent'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LessonsTab } from './lessons-tab'
import { parseKind, parseTab, type KindFilter, type MemoryTab } from './memory-view'
import { PolicyTab } from './policy-tab'
import { RawTab } from './raw-tab'

export default function MemoryPage() {
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))
  const vendor = params.get('vendor') ?? undefined
  const kind = parseKind(params.get('kind'))
  // shared with the tabs (same query keys), so the tab labels can carry counts
  const lessons = useQuery(lessonsQ())
  const recent = useQuery(memoryRecentQ())

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const tabs: { id: MemoryTab; label: string; count?: number }[] = [
    { id: 'lessons', label: 'Lessons', count: lessons.data?.length },
    { id: 'policy', label: 'Team policy' },
    { id: 'raw', label: 'Raw memories', count: recent.data?.length },
  ]

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
      <PageHeader
        eyebrow="Memory"
        title="Every decision becomes a precedent."
        description="Each resolution is filed to Hindsight as a lesson. Hindsight distils the lessons into team policy and recalls them when the next invoice looks the same."
      />
      <Tabs value={tab} onValueChange={(v) => setParam('tab', v === 'lessons' ? undefined : v)} className="mt-5 gap-8">
        <TabsList variant="line" className="-mx-1 h-9 w-full justify-start gap-0">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none px-3 text-[11px]">
              {t.label}
              {t.count != null && <span className="font-normal tabular-nums opacity-60">{t.count}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="lessons">
          <LessonsTab vendor={vendor} onVendor={(id) => setParam('vendor', id)} />
        </TabsContent>
        <TabsContent value="policy">
          <PolicyTab />
        </TabsContent>
        <TabsContent value="raw">
          <RawTab kind={kind} onKind={(k: KindFilter) => setParam('kind', k === 'all' ? undefined : k)} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
