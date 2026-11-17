import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { SiteShell } from '@/components/site-shell'

export function PrivacyPage() {
  return (
    <SiteShell path="/privacy/">
      <PageHeader
        eyebrow="Privacy Policy"
        title="Privacy at Solstice"
        description="We believe software should respect the people using it. Here is exactly what data is collected, where it goes, and what remains on your own machines."
      />

      <section className="mx-auto max-w-[900px] px-5 py-12 sm:px-8">
        <div className="space-y-10 text-[14.5px] leading-relaxed text-white/70">
          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">1. Self-Hosted Solstice Panels</h2>
              <p className="mt-3">
                When you install Solstice on your own server or cluster, you own the entire stack.
                The panel software includes <strong className="text-white">zero tracking, zero phone-home telemetry, and zero third-party scripts</strong>.
                All user accounts, passwords, passkeys, instance definitions, metrics, logs, and database records reside strictly on your infrastructure.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">2. Marketing Site (solstice.host)</h2>
              <p className="mt-3">
                On <code className="text-sun-400">solstice.host</code>, we run self-hosted, privacy-friendly analytics powered by Plausible Analytics (<code className="text-white/90">analytics.lumis.tf</code>).
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-white/60">
                <li>No cookies or persistent identifiers are stored on your device.</li>
                <li>No personal data or cross-site browsing history is ever tracked or sold.</li>
                <li>All analytics metrics (page views, referrer, browser family, country) are aggregated and fully anonymized.</li>
              </ul>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">3. Public Demo Instance (demo.solstice.host)</h2>
              <p className="mt-3">
                The public demo is provided for testing and evaluation purposes.
                Instances created on the demo environment are ephemeral and subject to periodic reseeding or automated pruning.
                Please do not submit sensitive personal data, production SSH credentials, or private secrets to the demo instance.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">4. Transactional Mail Service</h2>
              <p className="mt-3">
                If an installation chooses to utilize the managed Solstice mail relay for sending verification codes or system notices, message metadata and delivery events are processed transiently to dispatch the email and are not harvested for advertising or marketing.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-[18px] font-semibold text-white">5. Contact & Questions</h2>
              <p className="mt-3">
                If you have any questions or feedback regarding this privacy policy or our open-source software, reach out via our GitHub repository at{' '}
                <a
                  href="https://github.com/heyitslumi/solstice"
                  className="text-sun-400 underline underline-offset-4 hover:text-sun-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/heyitslumi/solstice
                </a>
                .
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  )
}
