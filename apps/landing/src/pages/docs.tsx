import { PageHeader } from '@/components/page-header'
import { SiteShell } from '@/components/site-shell'

export function DocsPage() {
  return (
    <SiteShell path="/docs/">
      <PageHeader eyebrow="Docs" title="Run it, then run it well.">
        <p>Placeholder — filled in by the docs task.</p>
      </PageHeader>
    </SiteShell>
  )
}
