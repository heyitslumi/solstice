import { useAppConfig } from '@/lib/config'
import { LegalLinks } from '@/components/legal-links'

/* Persistent site footer: copyright + powered-by on the left, legal links
   on the right. Wraps on small screens. */
export function SiteFooter() {
  const { config } = useAppConfig()
  const name = config.name || 'Solstice'
  const hasLegalLinks = Boolean(
    config.legalTermsUrl?.trim() || config.legalPrivacyUrl?.trim() || config.legalAupUrl?.trim(),
  )
  return (
    <footer className="shrink-0 border-t border-border px-5 py-3 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] text-fg-subtle">
          © {new Date().getFullYear()} {name} — powered by{' '}
          <a
            href="https://solstice.host"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-accent-text"
          >
            Solstice
          </a>
        </p>
        {hasLegalLinks ? (
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <LegalLinks className="text-[11px] text-fg-muted transition-colors hover:text-accent-text" />
          </nav>
        ) : null}
      </div>
    </footer>
  )
}
