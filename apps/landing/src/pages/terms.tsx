import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { SiteShell } from '@/components/site-shell'

export function TermsPage() {
  return (
    <SiteShell path="/terms/">
      <PageHeader
        eyebrow="Terms of Service"
        title="Terms of Service"
        description="Guidelines and terms governing the use of Solstice software, solstice.host, and the public demo sandbox."
      />

      <section className="mx-auto max-w-[900px] px-5 py-12 sm:px-8">
        <div className="space-y-10 text-[14.5px] leading-relaxed text-white/70">
          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">1. Open Source License</h2>
              <p className="mt-3">
                The Solstice VPS panel, CLI, and associated tools are licensed under the{' '}
                <a
                  href="https://github.com/heyitslumi/solstice/blob/main/LICENSE"
                  className="text-sun-400 underline underline-offset-4 hover:text-sun-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  MIT License
                </a>
                . You are free to inspect, run, modify, fork, and distribute the software in accordance with the terms of that license.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">2. &ldquo;As Is&rdquo; Disclaimer</h2>
              <p className="mt-3">
                The software and services are provided &ldquo;as is&rdquo;, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
                You are solely responsible for ensuring the backup, integrity, and security of your servers, networks, and containers.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">3. Public Demo & Hosted Infrastructure</h2>
              <p className="mt-3">
                Access to <code className="text-sun-400">demo.solstice.host</code> is provided on a courtesy basis.
                By using the demo, you agree not to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-white/60">
                <li>Deploy malicious software, botnets, crypto miners, or network scanners.</li>
                <li>Attempt denial-of-service attacks, port flooding, or unauthorized host access.</li>
                <li>Violate applicable local or international laws and regulations.</li>
              </ul>
              <p className="mt-3">
                We reserve the right to terminate abusive sessions, reset the sandbox state, or restrict access to demo infrastructure at any time without prior notice.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">4. Changes to Terms</h2>
              <p className="mt-3">
                We may periodically update these terms to reflect changes in our hosted services or open-source infrastructure. Updates will be documented in our git history and posted on this page.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  )
}
