import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'solstice-theme'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme state for the panel. The initial class is applied by the inline script
 * in index.html so there is no flash of the wrong theme on first paint; this
 * hook takes over once React mounts.
 *
 * A server-side preference ('light' | 'dark') wins over the local stored /
 * device choice. 'system' (or absent) keeps the local behavior.
 */
export function useTheme(serverMode?: string | null) {
  const forced = serverMode === 'light' || serverMode === 'dark' ? serverMode : null
  const [localTheme, setLocalTheme] = useState<Theme>(readStoredTheme)

  const theme: Theme = forced ?? localTheme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const choose = useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next)
    setLocalTheme(next)
  }, [])

  const toggle = useCallback(() => {
    setLocalTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { theme, setTheme: choose, toggle, forced: forced !== null }
}
