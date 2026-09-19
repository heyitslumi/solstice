import { Link } from 'react-router-dom'

import { LEGAL_DOCUMENTS } from '@/lib/legal-meta'

export function AuthFooter() {
  return (
    <footer className="auth-footer border-t border-border">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p className="font-mono text-[11px] tracking-wide text-fg-subtle">
          © {new Date().getFullYear()} solstice.host
        </p>

        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_DOCUMENTS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-[12px] text-fg-muted transition-colors hover:text-accent-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
