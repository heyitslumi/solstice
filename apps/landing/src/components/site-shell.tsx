import { GithubLogo } from '@phosphor-icons/react'

export const INSTALL = 'curl -fsSL https://solstice.host/install.sh | sudo bash'

export const NAV = [
  { label: 'Features', href: '/features/' },
  { label: 'Architecture', href: '/architecture/' },
  { label: 'Docs', href: '/docs/' },
  { label: 'Install', href: '/install/' },
]

export function Mark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd05e" />
          <stop offset="55%" stopColor="#fd9d1e" />
          <stop offset="100%" stopColor="#fe5c36" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="7" fill="url(#sun)" />
      <g stroke="url(#sun)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M16 2v4M16 26v4M2 16h4M26 16h4" />
        <path d="M6.2 6.2l2.8 2.8M23 23l2.8 2.8M25.8 6.2L23 9M9 23l-2.8 2.8" opacity="0.75" />
      </g>
    </svg>
  )
}

function NavLink({ item, path }: { item: (typeof NAV)[number]; path: string }) {
  const active = path === item.href
  return (
    <a
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`transition-colors ${active ? 'text-white' : 'hover:text-white'}`}
    >
      {item.label}
    </a>
  )
}

function Nav({ path }: { path: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-brand-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5" aria-label="Solstice home">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">Solstice</span>
        </a>

        <nav className="hidden items-center gap-7 text-[13.5px] text-white/55 lg:flex">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} path={path} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* No-JS mobile menu: <details> toggles without a client router. */}
          <details className="group relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control border border-white/10 px-3 py-2 text-[13px] text-white/70 transition-colors hover:border-white/20 hover:text-white [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <nav className="absolute right-0 mt-2 flex w-44 flex-col gap-1 rounded-control border border-white/10 bg-[#0d141d] p-2 text-[13.5px] text-white/70 shadow-2xl">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={path === item.href ? 'page' : undefined}
                  className="rounded-md px-2.5 py-2 transition-colors hover:bg-white/5 hover:text-white aria-[current=page]:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </details>

          <a
            href="https://github.com/heyitslumi/solstice"
            className="flex items-center gap-2 rounded-control border border-white/10 px-3 py-2 text-[13px] text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            <GithubLogo size={16} weight="fill" aria-hidden />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href="/install/"
            className="rounded-control bg-sun-400 px-3.5 py-2 text-[13px] font-medium text-[#241503] transition-transform hover:bg-sun-300 active:translate-y-px"
          >
            Install
          </a>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Mark className="size-6" />
          <span className="text-[14px] font-medium">Solstice</span>
          <span className="text-[13px] text-white/35">Self-hosted VPS panel</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/45">
          <a href="https://github.com/heyitslumi/solstice" className="hover:text-white">
            GitHub
          </a>
          <a href="/features/" className="hover:text-white">
            Features
          </a>
          <a href="/architecture/" className="hover:text-white">
            Architecture
          </a>
          <a href="/docs/" className="hover:text-white">
            Docs
          </a>
          <a href="/install/" className="hover:text-white">
            Install
          </a>
          <a href="https://demo.solstice.host" className="hover:text-white">
            Live demo
          </a>
          <span className="font-mono text-[11.5px] text-white/25">Built on Incus · no telemetry</span>
        </nav>
      </div>
    </footer>
  )
}

export function SiteShell({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <>
      <Nav path={path} />
      <main>{children}</main>
      <Footer />
    </>
  )
}
