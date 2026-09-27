import { useQuery } from '@tanstack/react-query'
import { policyQ } from '@/api/queries'
import { AgentMark, Eyebrow, Markdown } from '@/components/precedent'
import { simDate, simTime } from '@/lib/format'
import { isPendingContent } from '@/lib/labels'
import { LoadError, ProseSkeleton } from './memory-states'

/** The team-wide policy Hindsight distils from every resolution, in the agent's serif voice. */
export function PolicyTab() {
  const q = useQuery({
    ...policyQ(),
    // keep looking while Hindsight is still drafting, including a null body (policyQ only polls on "Generating…")
    refetchInterval: (query) => (query.state.data && isPendingContent(query.state.data.content) ? 15_000 : false),
  })

  if (q.isPending) return <ProseSkeleton />
  if (!q.data) return <LoadError error={q.error ?? new Error('No data')} what="The team policy" onRetry={() => void q.refetch()} />

  const { content, refreshed_at } = q.data
  if (isPendingContent(content))
    return (
      <div className="max-w-3xl space-y-5 py-10" role="status">
        <Eyebrow className="flex items-center gap-1.5">
          <AgentMark /> Team policy
        </Eyebrow>
        <div className="writing-rule" aria-hidden />
        <p className="serif-display text-[1.75rem] leading-snug text-balance">
          Hindsight is drafting the team policy from every resolution so far…
        </p>
        <p className="text-sm text-pretty text-muted-foreground">
          It writes in the background. This page checks every 15 seconds and shows the draft when it lands.
        </p>
      </div>
    )

  return (
    <article className="max-w-3xl space-y-6">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-rule pb-3 text-xs text-muted-foreground">
        <AgentMark className="text-foreground" />
        <span>Maintained by Hindsight</span>
        {refreshed_at && (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              refreshed <time dateTime={refreshed_at}>{simDate(refreshed_at)}, {simTime(refreshed_at)}</time>
            </span>
          </>
        )}
      </p>
      <Markdown>{content ?? ''}</Markdown>
    </article>
  )
}
