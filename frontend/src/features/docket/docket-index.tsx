import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { exceptionsQ } from '@/api/queries'
import { AgentMark, EmptyState } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'

/** Right pane when no case is open. */
export default function DocketIndex() {
  const open = useQuery(exceptionsQ({ status: 'open' }))
  const { search } = useLocation()
  const first = open.data?.items[0]
  return (
    <div className="flex h-full min-h-[70vh] items-center justify-center">
      <EmptyState
        icon={<AgentMark className="size-5" />}
        title={first ? 'Open a case to see the evidence and Precedent’s opinion.' : 'Nothing is waiting for a decision.'}
        action={
          first && (
            <Button asChild className="mt-2">
              <Link to={`/exceptions/${first.id}${search}`}>Open {first.id}</Link>
            </Button>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> to move through the docket
        </span>
      </EmptyState>
    </div>
  )
}
