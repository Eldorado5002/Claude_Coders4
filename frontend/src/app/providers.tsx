import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { ApiError } from '@/api/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from './theme'

const SHOW_DEVTOOLS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('devtools')

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // the SSE stream keeps data fresh
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={250}>
          <LazyMotion features={domAnimation}>
            {children}
            <Toaster position="top-right" offset={{ top: 72 }} mobileOffset={{ top: 108 }} closeButton />
          </LazyMotion>
        </TooltipProvider>
      </ThemeProvider>
      {import.meta.env.DEV && SHOW_DEVTOOLS && <ReactQueryDevtools buttonPosition="top-right" />}
    </QueryClientProvider>
  )
}
