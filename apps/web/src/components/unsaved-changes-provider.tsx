import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { WarningCircle } from '@phosphor-icons/react'

interface UnsavedChangesContextType {
  isDirty: boolean
  setIsDirty: (dirty: boolean) => void
  confirmNavigation: (to: string | (() => void)) => boolean
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)
  const isDirtyRef = useRef(false)
  isDirtyRef.current = isDirty

  const [modalOpen, setModalOpen] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const currentLocationRef = useRef(location.pathname + location.search)
  currentLocationRef.current = location.pathname + location.search

  // Keep beforeunload as a safety net if the user closes/refreshes the tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Intercept browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      if (isDirtyRef.current) {
        // Push the previous location back onto history to cancel the browser's move
        window.history.pushState(null, '', currentLocationRef.current)
        pendingActionRef.current = () => {
          setIsDirty(false)
          window.history.back()
        }
        setModalOpen(true)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Intercept in-app link clicks globally
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!isDirtyRef.current) return
      // Ignore if event was already cancelled or middle/right click or modifier keys
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const target = e.target as HTMLElement | null
      const anchor = target?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      const targetAttr = anchor.getAttribute('target')
      // Only intercept internal links that don't open in new tabs/downloads
      if (!href || href.startsWith('blob:') || href.startsWith('#') || targetAttr === '_blank') return

      try {
        const url = new URL(href, window.location.origin)
        if (url.origin === window.location.origin) {
          const dest = url.pathname + url.search + url.hash
          if (dest !== currentLocationRef.current) {
            e.preventDefault()
            e.stopPropagation()
            pendingActionRef.current = () => {
              setIsDirty(false)
              navigate(dest)
            }
            setModalOpen(true)
          }
        }
      } catch {
        // Ignore invalid URLs
      }
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [navigate])

  function confirmNavigation(target: string | (() => void)): boolean {
    if (!isDirtyRef.current) {
      if (typeof target === 'function') target()
      else navigate(target)
      return true
    }

    pendingActionRef.current = () => {
      setIsDirty(false)
      if (typeof target === 'function') target()
      else navigate(target)
    }
    setModalOpen(true)
    return false
  }

  function handleDiscard() {
    setModalOpen(false)
    setIsDirty(false)
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (action) {
      action()
    }
  }

  function handleCancel() {
    setModalOpen(false)
    pendingActionRef.current = null
  }

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, setIsDirty, confirmNavigation }}>
      {children}

      {/* Custom Solstice Unsaved Changes Dialog */}
      <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-md p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
              <WarningCircle size={22} weight="bold" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-[16px] font-semibold text-fg">
                Unsaved Changes
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-fg-subtle">
                You have unsaved changes on this page. If you leave now, all your edits will be discarded.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              className="text-[13px]"
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDiscard}
              className="text-[13px]"
            >
              Discard Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  )
}

/**
 * Hook to manage dirty form state on editing pages.
 * Pass `true` when user has modified inputs.
 */
export function useDirtyForm(isDirty: boolean) {
  const ctx = useContext(UnsavedChangesContext)
  useEffect(() => {
    if (ctx) {
      ctx.setIsDirty(isDirty)
    }
    return () => {
      if (ctx) {
        ctx.setIsDirty(false)
      }
    }
  }, [isDirty, ctx])

  return ctx
}
