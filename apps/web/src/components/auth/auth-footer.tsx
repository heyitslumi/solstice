import { useAppConfig } from '@/lib/config'
import { LegalLinks } from '@/components/legal-links'

export function AuthFooter() {
  const { config } = useAppConfig()
  let host = ''
  try {
    host = config.url ? new URL(config.url).host : window.location.host
  } catch {
    host = window.location.host
  }
  return (
    <footer className="auth-footer border-t border-border">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p className="font-mono text-[11px] tracking-wide text-fg-subtle">
          © {new Date().getFullYear()} {host}
        </p>

        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          <LegalLinks className="text-[12px] text-fg-muted transition-colors hover:text-accent-text" />
        </nav>
      </div>
    </footer>
  )
}
