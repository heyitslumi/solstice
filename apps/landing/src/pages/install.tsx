import { PageHeader } from '@/components/page-header'
import { SiteShell } from '@/components/site-shell'

export function InstallPage() {
  return (
    <SiteShell path="/install/">
      <PageHeader eyebrow="Install" title="One command, your hardware.">
        <p>Placeholder — filled in by the install task.</p>
      </PageHeader>
    </SiteShell>
  )
}
