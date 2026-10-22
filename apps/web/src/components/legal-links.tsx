import { Link } from 'react-router-dom'

import { useAppConfig } from '@/lib/config'
import { LEGAL_DOCUMENTS } from '@/lib/legal-meta'

/* Footer legal links. An admin-set URL wins (external); otherwise the
   built-in document page is used. */
export function LegalLinks({ className }: { className?: string }) {
  const { config } = useAppConfig()

  const overrides: Record<string, string | undefined> = {
    '/legal/terms': config.legalTermsUrl || undefined,
    '/legal/privacy': config.legalPrivacyUrl || undefined,
    '/legal/aup': config.legalAupUrl || undefined,
  }

  return (
    <>
      {LEGAL_DOCUMENTS.map((item) => {
        const href = overrides[item.to]
        return href ? (
          <a
            key={item.to}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={className}
          >
            {item.label}
          </a>
        ) : (
          <Link key={item.to} to={item.to} className={className}>
            {item.label}
          </Link>
        )
      })}
    </>
  )
}
