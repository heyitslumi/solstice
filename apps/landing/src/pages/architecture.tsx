import { ArrowDown, Browser, DeviceMobile, EnvelopeSimple, ShieldCheck, Stack } from '@phosphor-icons/react'

import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { SiteShell } from '@/components/site-shell'

const HOPS = [
  {
    name: 'Browser',
    detail: 'The panel SPA. Talks HTTPS and one websocket for the console.',
    note: 'nothing installed on the client',
  },
  {
    name: 'Reverse proxy',
    detail: 'Caddy by default, or your own nginx or Apache. A Cloudflare tunnel also lands here.',
    note: 'TLS terminates here',
  },
  {
    name: 'Solstice API',
    detail: 'Node on systemd, running as the unprivileged solstice user. Serves the JSON API and the websocket console.',
    note: '127.0.0.1:8788',
  },
  {
    name: 'Incus daemon',
    detail: 'The same daemon the incus CLI talks to, over the local unix socket or a node address.',
    note: 'no control plane in between',
  },
  {
    name: 'LXD container / KVM VM',
    detail: 'Your instances. Each one is an Incus instance with its own limits, on the node’s bridge network.',
    note: 'isolated by the kernel',
  },
]

const CLAIMS = [
  {
    icon: ShieldCheck,
    title: 'One machine, no control plane',
    body: 'The panel, the database and the daemon live on the host you installed to. There is no SaaS account in the middle that can read your instance list or lose it.',
  },
  {
    icon: Stack,
    title: 'Isolation is the kernel’s job',
    body: 'Containers are unprivileged by default, capped by cgroup limits from the instance record. VMs get real hardware virtualisation when /dev/kvm exists.',
  },
  {
    icon: EnvelopeSimple,
    title: 'Mail takes the one hop it needs',
    body: 'The API hands a message to the relay worker with a per-install token. The worker applies per-minute and daily limits, then sends through SES. Nothing else about your install leaves the box.',
  },
]

export function ArchitecturePage() {
  return (
    <SiteShell path="/architecture/">
      <PageHeader eyebrow="Architecture" title="How the pieces fit.">
        <p>
          Five stops between a browser and a container. Every one of them is on hardware you
          control, and every one of them is inspectable with standard Linux tools.
        </p>
      </PageHeader>

      <section className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-8">
        <Reveal>
          <ol className="divide-y divide-white/6 overflow-hidden rounded-panel border border-white/8 bg-[#101822]">
            {HOPS.map((hop, i) => (
              <li key={hop.name} className="relative p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-mono text-[11.5px] text-sun-400/80">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="text-[17px] font-medium tracking-[-0.01em]">{hop.name}</h2>
                  <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/40">
                    {hop.note}
                  </span>
                </div>
                <p className="mt-2 max-w-[70ch] pl-0 text-[14px] leading-relaxed text-white/55 sm:pl-9">
                  {hop.detail}
                </p>
                {i < HOPS.length - 1 ? (
                  <ArrowDown
                    size={14}
                    className="mt-3 text-white/20 sm:ml-1.5"
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[12.5px] text-white/40">
            <span className="flex items-center gap-1.5">
              <Browser size={15} aria-hidden /> desktop
            </span>
            <span className="flex items-center gap-1.5">
              <DeviceMobile size={15} aria-hidden /> phone
            </span>
            <span className="font-mono">— the console works on both, nothing to install</span>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-white/5 bg-[#0c131b] py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <Reveal>
            <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem]">
              What that buys you
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {CLAIMS.map((claim, i) => {
              const Icon = claim.icon
              return (
                <Reveal key={claim.title} delay={i * 0.05}>
                  <article className="h-full rounded-panel border border-white/8 bg-[#101822] p-6">
                    <Icon size={22} weight="duotone" className="text-sun-300" aria-hidden />
                    <h3 className="mt-4 text-[16px] font-medium">{claim.title}</h3>
                    <p className="mt-2.5 text-[14px] leading-relaxed text-white/55">{claim.body}</p>
                  </article>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={0.1}>
            <div className="mt-10 rounded-panel border border-white/8 bg-[#101822] p-6">
              <h3 className="text-[15px] font-medium">The honest caveats</h3>
              <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-white/50">
                <li>
                  KVM needs <code className="font-mono text-white/70">/dev/kvm</code>. Without it you
                  get containers only, and the installer says so.
                </li>
                <li>
                  Postgres runs locally by default. Point the installer at an existing database with{' '}
                  <code className="font-mono text-white/70">--db-url</code> if you would rather not.
                </li>
                <li>
                  Panels do not cluster. One panel manages one Incus deployment; node records can
                  point at other hosts, but there is no quorum to configure.
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  )
}
