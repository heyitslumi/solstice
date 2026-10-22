import { useAppConfig } from '@/lib/config'

/* Footer legal links. Only rendered when the administrator has configured a URL. */
export function LegalLinks({ className }: { className?: string }) {
  const { config } = useAppConfig()

  const links = [
    { label: 'Terms of Service', href: config.legalTermsUrl?.trim() },
    { label: 'Acceptable Use Policy', href: config.legalAupUrl?.trim() },
    { label: 'Privacy Policy', href: config.legalPrivacyUrl?.trim() },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href))

  if (links.length === 0) return null

  return (
    <>
      {links.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={className}
        >
          {item.label}
        </a>
      ))}
    </>
  )
}
