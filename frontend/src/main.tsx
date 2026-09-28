import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { hideBootSplash } from './app/boot-splash'
import { Providers } from './app/providers'
import { router } from './app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)

// Safety net: the shell or the error page hides the splash; never let it cover a running app regardless.
window.setTimeout(() => hideBootSplash(), 10_000)
