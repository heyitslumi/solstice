import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { SiteShell } from '@/components/site-shell'

const QUICK_START = [
  {
    title: 'Install the panel',
    body: 'On a fresh Debian or Ubuntu box, as root. The installer asks for a hostname and an operator email, then does the rest.',
    code: 'curl -fsSL https://solstice.host/install.sh | sudo bash',
  },
  {
    title: 'Point DNS at it',
    body: 'An A record is enough. Caddy issues and renews the certificate on the first request. Using a tunnel instead? Skip this.',
    code: 'panel.example.com. 300 IN A 203.0.113.10',
  },
  {
    title: 'Register the administrator',
    body: 'Open the panel and sign in with the email you gave the installer. The first account with that address becomes the administrator.',
    code: 'https://panel.example.com',
  },
]

const CLI = [
  ['solstice status', 'Which services are running, and where the panel answers.'],
  ['solstice doctor', 'API reachability, listening ports, service state.'],
  ['solstice logs api', 'Follow the API log (web and tunnel work too).'],
  ['solstice restart', 'Restart the API and the web server.'],
  ['solstice upgrade', 'Pull, rebuild and restart in place.'],
  ['solstice uninstall', 'Stop and remove services; add --purge to delete data.'],
]

const TROUBLE = [
  [
    'The installer stopped part way',
    'Read /var/log/solstice-install.log — every step is logged with a timestamp, and a failure prints the last 25 lines. Re-run with --yes once fixed; the installer reuses the existing database credentials.',
  ],
  [
    'TLS never issues',
    'DNS has to point at the box before certbot can answer the challenge. With nginx or Apache the installer falls back to HTTP and prints the exact certbot command to run later.',
  ],
  [
    'The panel answers locally but not publicly',
    'Check the proxy service and the firewall: journalctl -u caddy (or nginx/apache2), and confirm 80/443 are open. With a tunnel, check journalctl -u cloudflared.',
  ],
  [
    'Sign-in links never arrive',
    'Mail goes through Solstice Cloud Relay by default. Settings → Mail shows the current provider and lets you switch to your own SMTP server.',
  ],
]

export function DocsPage() {
  return (
    <SiteShell path="/docs/">
      <PageHeader eyebrow="Docs" title="Run it, then run it well.">
        <p>
          The short version of everything an operator needs. The source of truth is the repository —
          these pages explain the shape of it, not every endpoint.
        </p>
      </PageHeader>

      <section className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-8">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Quick start</h2>
        </Reveal>
        <ol className="mt-8 divide-y divide-white/6 border-y border-white/6">
          {QUICK_START.map((step, i) => (
            <li key={step.title} className="grid gap-4 py-6 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-5">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[12px] text-sun-400/80">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-[16px] font-medium">{step.title}</h3>
                </div>
                <p className="mt-2 max-w-[46ch] pl-7 text-[13.5px] leading-relaxed text-white/50">
                  {step.body}
                </p>
              </div>
              <div className="min-w-0 lg:col-span-7">
                <pre className="overflow-x-auto rounded-control border border-white/8 bg-[#0d141d] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/70">
                  <code>{step.code}</code>
                </pre>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-white/5 bg-[#0c131b] py-16">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 sm:px-8 lg:grid-cols-12">
          <Reveal className="min-w-0 lg:col-span-4">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Command line</h2>
            <p className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-white/50">
              The installer drops a small <code className="font-mono text-white/70">solstice</code>{' '}
              helper on the host. It reads the install record, so it always talks to the right
              services.
            </p>
          </Reveal>
          <Reveal delay={0.08} className="min-w-0 lg:col-span-8">
            <div className="overflow-hidden rounded-panel border border-white/8">
              <table className="w-full text-left text-[13px]">
                <tbody className="divide-y divide-white/6">
                  {CLI.map(([command, description]) => (
                    <tr key={command} className="bg-[#101822]">
                      <td className="w-[38%] px-4 py-3 align-top font-mono text-[12px] whitespace-nowrap text-sun-200/80">
                        {command}
                      </td>
                      <td className="px-4 py-3 align-top text-white/55">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">When something breaks</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {TROUBLE.map(([title, body], i) => (
            <Reveal key={title} delay={i * 0.04}>
              <article className="h-full rounded-panel border border-white/8 bg-[#101822] p-5">
                <h3 className="text-[14.5px] font-medium">{title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">{body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="mt-10 flex flex-wrap gap-6 text-[13.5px]">
            <a
              href="https://github.com/heyitslumi/solstice"
              className="text-sun-300 hover:text-sun-200"
            >
              Source on GitHub →
            </a>
            <a
              href="https://github.com/heyitslumi/solstice/issues"
              className="text-sun-300 hover:text-sun-200"
            >
              Report an issue →
            </a>
            <a href="/install/" className="text-white/55 hover:text-white">
              Install options →
            </a>
            <a href="/architecture/" className="text-white/55 hover:text-white">
              Architecture →
            </a>
          </div>
        </Reveal>
      </section>
    </SiteShell>
  )
}
