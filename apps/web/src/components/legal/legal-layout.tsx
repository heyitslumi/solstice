import { CaretDown } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { ThemeToggle } from '@/components/auth/theme-toggle'
import { useAppConfig } from '@/lib/config'
import { LegalLinks } from '@/components/legal-links'
import { cn } from '@/lib/utils'

interface LegalLayoutProps {
  title: string
  updated: string
  children: ReactNode
}

interface Section {
  id: string
  label: string
}

function TocLinks({
  sections,
  activeId,
  onNavigate,
}: {
  sections: Section[]
  activeId: string | null
  onNavigate?: () => void
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {sections.map((section) => {
        const isActive = section.id === activeId
        return (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={onNavigate}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'block rounded-[6px] px-2.5 py-1.5 text-[13px] leading-snug transition-colors',
                isActive
                  ? 'bg-surface-2 font-medium text-accent-text'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {section.label}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function LegalBrandName() {
  const { config } = useAppConfig()
  return <>{config.name || 'VPS Panel'}</>
}

function LegalTagline() {
  const { config } = useAppConfig()
  const tagline = config.tagline || 'VPS Hosting'
  if (!tagline) return null
  return (
    <span className="text-[8px] leading-none font-medium tracking-[0.36em] text-sun-600 uppercase">
      {tagline}
    </span>
  )
}

function LegalHost() {
  const { config } = useAppConfig()
  let host = ''
  try {
    host = config.url ? new URL(config.url).host : window.location.host
  } catch {
    host = window.location.host
  }
  return <p className="font-mono text-[11px] tracking-wide text-fg-subtle">{host}</p>
}

export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  const { pathname } = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tocOpen, setTocOpen] = useState(false)

  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const headings = [...root.querySelectorAll('h2')]
    setSections(
      headings.map((heading, index) => {
        const id = heading.id || `section-${index + 1}`
        heading.id = id
        return { id, label: heading.textContent ?? '' }
      }),
    )
    setActiveId(headings[0]?.id ?? null)

    if (headings.length === 0) return

    /*
     * IntersectionObserver only reports entries whose state CHANGED, so picking
     * the topmost from a single callback batch lands on the wrong section. Keep
     * the full visible set instead and resolve the active heading from it.
     */
    const visible = new Set<string>()
    let atEnd = false

    const resolveActive = () => {
      if (atEnd) {
        setActiveId(headings[headings.length - 1]!.id)
        return
      }
      const firstVisible = headings.find((heading) => visible.has(heading.id))
      if (firstVisible) setActiveId(firstVisible.id)
    }

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        resolveActive()
      },
      { rootMargin: '-1px 0px -70% 0px' },
    )

    /*
     * The final sections can never reach the reading band, because the page runs
     * out of scroll before they get there. A sentinel at the end of the document,
     * observed against the full viewport, is what marks "we are at the bottom".
     */
    const endObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        atEnd = entry.isIntersecting
        resolveActive()
      },
      { rootMargin: '0px' },
    )

    headings.forEach((heading) => sectionObserver.observe(heading))
    if (endRef.current) endObserver.observe(endRef.current)
    return () => {
      sectionObserver.disconnect()
      endObserver.disconnect()
    }
  }, [pathname])

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            to="/login"
            className="flex items-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <img src="/brand/mark.svg" alt="" className="h-7 w-auto shrink-0" />
            <span className="flex flex-col gap-1">
              <span className="text-[13px] leading-none font-semibold tracking-[0.24em] text-fg uppercase">
                <LegalBrandName />
              </span>
              <LegalTagline />
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              to="/login"
              className="rounded-control px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
        <div key={pathname} className="animate-page">
          <h1 className="text-[clamp(1.75rem,3.5vw,2.25rem)] leading-tight font-semibold tracking-tight text-fg">
            {title}
          </h1>
          <p className="mt-3 text-[13px] text-fg-subtle">Last updated {updated}</p>

          {sections.length > 1 ? (
            <details
              className="group mt-6 lg:hidden"
              open={tocOpen}
              onToggle={(event) => {
                setTocOpen(event.currentTarget.open)
              }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-control border border-field-border px-3 py-2.5 text-[13px] font-medium text-fg transition-colors hover:border-field-border-hover [&::-webkit-details-marker]:hidden">
                On this page
                <CaretDown
                  size={14}
                  aria-hidden
                  className="text-fg-subtle transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="pt-2">
                <TocLinks
                  sections={sections}
                  activeId={activeId}
                  onNavigate={() => {
                    setTocOpen(false)
                  }}
                />
              </div>
            </details>
          ) : null}

          <hr className="my-8 border-border lg:my-10" />

          <div className="lg:flex lg:gap-14">
            <article ref={contentRef} className="legal-prose min-w-0 max-w-[68ch] flex-1">
              {children}
              <div ref={endRef} aria-hidden className="h-px" />
            </article>

            {sections.length > 1 ? (
              <nav aria-label="On this page" className="hidden lg:block lg:w-56 lg:shrink-0 xl:w-64">
                <div className="sticky top-10">
                  <p className="mb-2.5 px-2.5 font-mono text-[10px] tracking-[0.16em] text-fg-subtle uppercase">
                    On this page
                  </p>
                  <TocLinks sections={sections} activeId={activeId} />
                </div>
              </nav>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <LegalHost />
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <LegalLinks className="text-[13px] text-fg-muted transition-colors hover:text-accent-text" />
          </nav>
        </div>
      </footer>
    </div>
  )
}
