import { Wordmark } from '@/components/brand/wordmark'

/** First paint while lazy routes load. */
export function Splash() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background text-foreground">
      <Wordmark className="h-9 w-auto" />
      <div className="writing-rule w-40" aria-hidden />
    </div>
  )
}
