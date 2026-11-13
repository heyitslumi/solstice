import { Check, Copy, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { SiteShell } from '@/components/site-shell'
import { useCopy } from '@/components/use-copy'

type Proxy = 'caddy' | 'nginx' | 'apache' | 'none'
type Tunnel = 'none' | 'quick' | 'token'

const PROXIES: Array<{ id: Proxy; name: string; note: string }> = [
  { id: 'caddy', name: 'Caddy', note: 'Recommended. Automatic TLS, zero config.' },
  { id: 'nginx', name: 'nginx', note: 'Adds a vhost and runs certbot.' },
  { id: 'apache', name: 'Apache', note: 'Adds a vhost and runs certbot.' },
  { id: 'none', name: 'None', note: 'You already run the proxy.' },
]

const TUNNELS: Array<{ id: Tunnel; name: string; note: string }> = [
  { id: 'none', name: 'No tunnel', note: 'Direct connection on ports 80/443.' },
  { id: 'quick', name: 'Quick tunnel', note: 'Random trycloudflare.com URL. No account.' },
  { id: 'token', name: 'Your domain', note: 'Cloudflare named tunnel, using a token.' },
]

const FLAGS = [
  ['--domain HOST', 'Public hostname the panel answers on.'],
  ['--proxy NAME', 'caddy (default), nginx, apache, or none.'],
  ['--tunnel', 'Expose through a Cloudflare quick tunnel instead of a proxy.'],
  ['--tunnel-token T', 'Cloudflare named tunnel token, for your own domain.'],
  ['--admin-email E', 'The address that becomes administrator on first sign-up.'],
  ['--mail relay|smtp', 'Solstice Cloud Relay (default) or your own SMTP server.'],
  ['--db-url URL', 'Use an existing Postgres instead of installing one.'],
  ['--no-incus', 'Panel only, no workloads on this host.'],
  ['--yes', 'Accept defaults, ask nothing.'],
]

export function buildCommand(options: {
  proxy: Proxy
  tunnel: Tunnel
  token?: string
  domain?: string
  email?: string
}): string {
  const flags: string[] = []
  const domain = options.domain?.trim()
  const email = options.email?.trim()

  // A tunnel replaces the proxy: install.sh treats --tunnel as "no Caddy".
  if (options.tunnel === 'none' && options.proxy !== 'caddy') {
    flags.push('--proxy', options.proxy)
  }
  if (options.tunnel === 'quick') flags.push('--tunnel')
  if (options.tunnel === 'token') {
    flags.push('--tunnel-token', options.token?.trim() || '<TOKEN>')
  }
  // A quick tunnel already has a hostname; passing one would point the mail
  // relay at a domain that does not answer.
  if (domain && needsDomain(options)) flags.push('--domain', domain)
  if (email) flags.push('--admin-email', email)

  // `bash` needs -s -- so the flags reach the script on stdin, not bash itself.
  const tail = flags.length > 0 ? ` -s -- ${flags.join(' ')}` : ''
  return `curl -fsSL https://solstice.host/install.sh | sudo bash${tail}`
}

export function needsDomain(options: { tunnel: Tunnel; proxy: Proxy }): boolean {
  return options.tunnel === 'token' || (options.tunnel === 'none' && options.proxy !== 'none')
}

function Choice({
  active,
  name,
  note,
  onClick,
}: {
  active: boolean
  name: string
  note: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-control border p-3.5 text-left transition-colors ${
        active
          ? 'border-sun-500/50 bg-sun-500/10'
          : 'border-white/10 bg-[#101822] hover:border-white/20'
      }`}
    >
      <span className={`block text-[13.5px] font-medium ${active ? 'text-white' : 'text-white/80'}`}>
        {name}
      </span>
      <span className="mt-1 block text-[12px] leading-relaxed text-white/45">{note}</span>
    </button>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[12px] tracking-[0.02em] text-white/50">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="mt-1.5 w-full rounded-control border border-white/10 bg-[#0d141d] px-3 py-2.5 font-mono text-[12.5px] text-white/80 outline-none placeholder:text-white/25 focus:border-sun-500/50"
      />
    </label>
  )
}

export function InstallPage() {
  const [proxy, setProxy] = useState<Proxy>('caddy')
  const [tunnel, setTunnel] = useState<Tunnel>('none')
  const [token, setToken] = useState('')
  const [domain, setDomain] = useState('')
  const [email, setEmail] = useState('')

  const command = useMemo(
    () => buildCommand({ proxy, tunnel, token, domain, email }),
    [proxy, tunnel, token, domain, email],
  )
  const { copied, copy } = useCopy(command)
  const missingDomain = needsDomain({ tunnel, proxy }) && !domain.trim()

  return (
    <SiteShell path="/install/">
      <PageHeader eyebrow="Install" title="One command, your hardware.">
        <p>
          A fresh Debian or Ubuntu box, root access, and a hostname. The installer asks before it
          touches anything and refuses to report success until the API answers.
        </p>
      </PageHeader>

      <section className="mx-auto max-w-[1200px] px-5 pb-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="min-w-0 lg:col-span-7">
            <div>
              <fieldset>
                <legend className="text-[12px] tracking-[0.14em] text-white/35 uppercase">
                  Web server
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PROXIES.map((item) => (
                    <Choice
                      key={item.id}
                      name={item.name}
                      note={item.note}
                      active={proxy === item.id}
                      onClick={() => setProxy(item.id)}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset className="mt-7">
                <legend className="text-[12px] tracking-[0.14em] text-white/35 uppercase">
                  Public access
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {TUNNELS.map((item) => (
                    <Choice
                      key={item.id}
                      name={item.name}
                      note={item.note}
                      active={tunnel === item.id}
                      onClick={() => setTunnel(item.id)}
                    />
                  ))}
                </div>
                {tunnel !== 'none' ? (
                  <p className="mt-3 text-[12.5px] text-white/40">
                    A tunnel replaces the web server, so the proxy choice above is ignored.
                  </p>
                ) : null}
              </fieldset>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {tunnel === 'token' ? (
                  <Field
                    id="tunnel-token"
                    label="Cloudflare tunnel token"
                    value={token}
                    onChange={setToken}
                    placeholder="eyJhIjoi…"
                  />
                ) : null}
                {needsDomain({ tunnel, proxy }) ? (
                  <Field
                    id="domain"
                    label="Public hostname (required)"
                    value={domain}
                    onChange={setDomain}
                    placeholder="panel.example.com"
                  />
                ) : null}
                <Field
                  id="email"
                  label="Operator email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  type="email"
                />
              </div>

              {tunnel === 'none' && proxy === 'none' ? (
                <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-white/40">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-white/30" aria-hidden />
                  Nothing will be exposed. Point your own proxy at 127.0.0.1:8788 once the panel is
                  up.
                </p>
              ) : null}
            </div>
          </Reveal>

          <Reveal delay={0.08} className="min-w-0 lg:col-span-5">
            <div className="sticky top-24">
              <div className="rounded-panel border border-white/10 bg-[#0d141d] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-white/35 uppercase">
                    Run as root
                  </span>
                  <button
                    type="button"
                    onClick={copy}
                    className="flex items-center gap-1.5 rounded-control border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition-colors hover:border-white/25 hover:text-white"
                  >
                    {copied ? (
                      <Check size={13} weight="bold" aria-hidden />
                    ) : (
                      <Copy size={13} aria-hidden />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <pre className="mt-3 overflow-x-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all text-white/75">
                  <code>{command}</code>
                </pre>

                {missingDomain ? (
                  <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-300/80">
                    <WarningCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    Add a hostname — the installer needs it for links and passkeys.
                  </p>
                ) : null}
              </div>

              <p className="mt-4 text-[12.5px] leading-relaxed text-white/40">
                Every prompt can be answered on the command line. Run the installer with{' '}
                <code className="font-mono text-white/60">--help</code> to see the full list.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-16">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">What the installer does</h2>
          <ol className="mt-6 divide-y divide-white/6 border-y border-white/6">
            {[
              ['Checks the box', 'Debian 12/13 or Ubuntu 22.04/24.04, amd64 or arm64, disk and memory floors, and whether /dev/kvm exists.'],
              ['Installs the stack', 'Node, Postgres, Incus, and your chosen web server — or configures the tunnel instead.'],
              ['Builds and starts', 'Fetches the repo, builds the panel, writes systemd units and starts the API as a non-root user.'],
              ['Configures the outside world', 'TLS or tunnel, the public URL, and the mail relay registration.'],
              ['Verifies before it claims success', 'Polls the local API, then the public URL, and prints the panel address when it answers.'],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-5 py-5">
                <span className="mt-0.5 font-mono text-[12px] text-sun-400/80">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-[15px] font-medium">{title}</h3>
                  <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-white/50">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:grid-cols-12">
          <Reveal className="min-w-0 lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Requirements</h2>
            <dl className="mt-6 space-y-4">
              {[
                ['OS', 'Debian 12 or 13, Ubuntu 22.04 or 24.04'],
                ['Architecture', 'amd64 or arm64'],
                ['Memory', '1 GB minimum, 2 GB or more recommended'],
                ['Disk', '4 GB free, more for instances'],
                ['Ports', '80 and 443 for automatic TLS (not needed with a tunnel)'],
                ['KVM', 'Optional. Without /dev/kvm you get containers only.'],
              ].map(([term, value]) => (
                <div key={term} className="border-t border-white/8 pt-3">
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-white/35 uppercase">
                    {term}
                  </dt>
                  <dd className="mt-1.5 text-[14px] leading-relaxed text-white/70">{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={0.08} className="min-w-0 lg:col-span-7">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Flags</h2>
            <div className="mt-6 overflow-hidden rounded-panel border border-white/8">
              <table className="w-full text-left text-[13px]">
                <tbody className="divide-y divide-white/6">
                  {FLAGS.map(([flag, description]) => (
                    <tr key={flag} className="bg-[#101822]">
                      <td className="w-[46%] px-4 py-3 align-top font-mono text-[12px] whitespace-nowrap text-sun-200/80">
                        {flag}
                      </td>
                      <td className="px-4 py-3 align-top text-white/55">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-white/40">
              Already installed?{' '}
              <code className="font-mono text-white/65">solstice upgrade</code> pulls, rebuilds and
              restarts. <code className="font-mono text-white/65">solstice doctor</code> reports what
              is broken.
            </p>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  )
}
