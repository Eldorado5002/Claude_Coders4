import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

/** Keeps one block's render error local, so the shell, sidebar and stage rail stay usable mid-demo. */
export function Safe({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <div role="alert" className="flex items-center justify-between gap-3 border border-dashed border-rule px-4 py-3 text-sm text-muted-foreground">
          <span>{label} couldn’t render.</span>
          <button type="button" className="text-xs font-medium underline underline-offset-4 hover:text-foreground" onClick={resetErrorBoundary}>
            Try again
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
