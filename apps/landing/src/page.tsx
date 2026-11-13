import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

import { StrictMode, type ComponentType } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import './index.css'

export function mountPage(Page: ComponentType) {
  const root = document.getElementById('root')!
  const app = (
    <StrictMode>
      <Page />
    </StrictMode>
  )
  // Builds prerender each page into the shell; hydrate when markup is present.
  if (root.firstChild) hydrateRoot(root, app)
  else createRoot(root).render(app)
}
