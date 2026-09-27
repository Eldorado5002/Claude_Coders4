import { createBrowserRouter, redirect } from 'react-router'
import { RouteError } from './route-error'
import { AppShell } from './shell/app-shell'
import { Splash } from './splash'

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    errorElement: <RouteError />,
    HydrateFallback: Splash,
    children: [
      { index: true, loader: () => redirect('/exceptions') },
      {
        path: 'exceptions',
        lazy: page(() => import('@/features/docket/docket-page')),
        children: [
          { index: true, lazy: page(() => import('@/features/docket/docket-index')) },
          { path: ':id', lazy: page(() => import('@/features/case-file/case-file-page')) },
        ],
      },
      { path: 'trust', lazy: page(() => import('@/features/trust/trust-page')) },
      { path: 'vendors', lazy: page(() => import('@/features/vendors/vendors-page')) },
      { path: 'vendors/:id', lazy: page(() => import('@/features/vendors/vendor-page')) },
      { path: 'learning', lazy: page(() => import('@/features/learning/learning-page')) },
      { path: 'memory', lazy: page(() => import('@/features/memory/memory-page')) },
      { path: 'capture', lazy: page(() => import('@/features/capture/capture-page')) },
      { path: '*', loader: () => { throw new Response('Not found', { status: 404 }) } },
    ],
  },
])
