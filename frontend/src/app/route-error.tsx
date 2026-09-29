import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { useBootSplashDone } from './boot-splash'

export function RouteError() {
  // an error can be the first screen: it must never sit under the splash
  useBootSplashDone()
  const err = useRouteError()
  const notFound = isRouteErrorResponse(err) && err.status === 404
  const detail = isRouteErrorResponse(err) ? err.statusText : err instanceof Error ? err.message : String(err)
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {notFound ? 'Not in the ledger' : 'Something went wrong'}
      </p>
      <h1 className="serif-display max-w-lg text-3xl leading-tight text-balance">
        {notFound ? 'There’s no page at this address.' : 'This page hit an error before it could render.'}
      </h1>
      {!notFound && <p className="max-w-lg font-mono text-xs text-muted-foreground">{detail}</p>}
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/exceptions">Back to the docket</Link>
        </Button>
        {!notFound && (
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        )}
      </div>
    </div>
  )
}
