import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from '@/App'
import { ScrollToTop } from '@/components/scroll-to-top'
import { SessionProvider } from '@/components/session-provider'
import '@/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ScrollToTop />
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
