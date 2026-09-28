import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { exceptionsQ } from '@/api/queries'
import { AgentMark, EmptyState } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { docketView, parseSort, querySort } from './docket-view'

/** Right pane when no case is open. */
export default function DocketIndex() {
  const [params] = useSearchParams()
  const sort = parseSort(params.get('sort'))
  const open = useQuery(exceptionsQ({ status: 'open', sort: querySort(sort) }))
  const { search } = useLocation()
  // the case at the top of the docket, in the order the list shows it
  const first = open.data ? docketView(open.data.items, 'open', sort).visible[0] : undefined
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
