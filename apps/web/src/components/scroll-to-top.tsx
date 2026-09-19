import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * React Router does not reset scroll position on navigation, so following a
 * footer link would drop you into the middle of the next document. Runs in a
 * layout effect to reset before paint, and skips when the target has a hash so
 * the table of contents can scroll to a section instead.
 *
 * `behavior: 'instant'` overrides the global smooth scroll, which would
 * otherwise animate a slow crawl up from the bottom of a long document.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useLayoutEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])

  return null
}
