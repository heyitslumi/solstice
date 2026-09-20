import {
  ChartLineUp,
  ClockCounterClockwise,
  Globe,
  HardDrives,
  List,
  ShieldStar,
  SquaresFour,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

/** Matches --ease-out-expo in index.css so the drawer moves like the rest of the app. */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface NavItem {
  label: string
  icon: ReactNode
  to?: string
}

const NAV: NavItem[] = [
  { label: 'Overview', icon: <SquaresFour size={17} aria-hidden />, to: '/dashboard' },
  { label: 'Servers', icon: <HardDrives size={17} aria-hidden /> },
  { label: 'Snapshots', icon: <ClockCounterClockwise size={17} aria-hidden /> },
  { label: 'Network', icon: <Globe size={17} aria-hidden /> },
  { label: 'Usage', icon: <ChartLineUp size={17} aria-hidden /> },
]

function SidebarContent({ onNavigate }: { onNavigate?: (to?: string) => void }) {
  const { pathname } = useLocation()
  const { user } = useSession()

  function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, to?: string) {
    if (!onNavigate) return
    if (!to || pathname === to) {
      onNavigate()
      return
    }
    e.preventDefault()
    onNavigate(to)
  }

  return (
    <div className="flex h-full flex-col gap-7 px-3 py-5">
      <Link
        to="/dashboard"
        onClick={(e) => handleLinkClick(e, '/dashboard')}
        className="flex items-center gap-2.5 rounded-control px-2 py-1"
      >
        <img src="/brand/solstice-mark.png" alt="" className="h-7 w-auto shrink-0" />
        <span className="flex flex-col gap-1">
          <span className="text-[12px] leading-none font-semibold tracking-[0.24em] text-fg uppercase">
            Solstice
          </span>
          <span className="text-[8px] leading-none font-medium tracking-[0.36em] text-sun-500 uppercase">
            VPS Hosting
          </span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          if (!item.to) {
            return (
              <span
                key={item.label}
                className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] text-fg-subtle"
              >
                {item.icon}
                {item.label}
                <span className="ml-auto font-mono text-[10px] tracking-wide text-fg-subtle/70 uppercase">
                  soon
                </span>
              </span>
            )
          }

          const active = pathname === item.to

          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={(e) => handleLinkClick(e, item.to)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] transition-colors duration-150',
                active
                  ? 'bg-surface-2 font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}

        {user?.isAdmin ? (
          <Link
            to="/admin"
            onClick={(e) => handleLinkClick(e, '/admin')}
            aria-current={pathname === '/admin' ? 'page' : undefined}
            className={cn(
              'mt-4 flex items-center gap-2.5 border-t border-border pt-4 text-[13px] transition-colors duration-150',
              pathname === '/admin'
                ? 'font-medium text-sun-500'
                : 'text-fg-muted hover:text-sun-500',
            )}
          >
            <ShieldStar size={17} aria-hidden />
            Admin
          </Link>
        ) : null}
      </nav>

        <div className="mt-auto">
          <UserMenu onNavigate={onNavigate} />
        </div>
      </div>
  )
}

interface AppShellProps {
  title: ReactNode
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function AppShell({ title, description, actions, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pendingNavRef = useRef<string | null>(null)

  function handleNavigate(to?: string) {
    if (to && to !== pathname) {
      pendingNavRef.current = to
      setTimeout(() => {
        if (pendingNavRef.current) {
          const dest = pendingNavRef.current
          pendingNavRef.current = null
          navigate(dest)
        }
      }, 350)
    } else {
      pendingNavRef.current = null
    }
    setMenuOpen(false)
  }

  function handleExitComplete() {
    if (pendingNavRef.current) {
      const dest = pendingNavRef.current
      pendingNavRef.current = null
      navigate(dest)
    }
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/*
        Block, not flex. As a flex container this aside sized its single child by
        content, which ran 6px wider than the fixed 240px column and pushed a
        horizontal overflow into the shell. It is also deliberately not `sticky`:
        the dialog scroll-lock sets `overflow: hidden` on the body, which makes the
        body the sticky scrollport, and the sidebar then snaps to document-top and
        leaves the viewport entirely on any scrolled page.
      */}
      <aside className="hidden h-full w-60 shrink-0 border-r border-border bg-surface lg:block">
        <SidebarContent />
      </aside>

      <AnimatePresence onExitComplete={handleExitComplete}>
        {menuOpen ? (
          <>
            <motion.button
              key="drawer-backdrop"
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-50 cursor-default bg-black/55 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT_EXPO }}
              onClick={() => {
                pendingNavRef.current = null
                setMenuOpen(false)
              }}
            />
            <motion.aside
              key="drawer-panel"
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-surface lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE_OUT_EXPO }}
            >
              <SidebarContent onNavigate={handleNavigate} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-bg">
          <div className="flex min-h-16 items-center gap-3 px-5 py-3 sm:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
              onClick={() => {
                setMenuOpen(true)
              }}
            >
              <List size={18} aria-hidden />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] leading-tight font-semibold tracking-tight text-fg">
                {title}
              </h1>
              {description ? (
                <p className="truncate text-[12px] text-fg-subtle">{description}</p>
              ) : null}
            </div>

            {actions}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  )
}
