import {
  CloudArrowUp,
  Fingerprint,
  Globe,
  HardDrives,
  Key,
  EnvelopeSimple,
  ShieldCheck,
  TerminalWindow,
} from '@phosphor-icons/react'

import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { SiteShell } from '@/components/site-shell'

type Group = {
  icon: React.ComponentType<{ size?: number; weight?: 'duotone'; className?: string }>
  title: string
  lead: string
  points: string[]
  shot?: { src: string; alt: string; caption: string }
}

const GROUPS: Group[] = [
  {
    icon: HardDrives,
    title: 'Compute on Incus',
    lead: 'Solstice is a UI over the Incus daemon on your own machine — not a wrapper around someone else’s cloud. System containers for density, full KVM machines when you need a kernel of your own.',
    points: [
      'LXC system containers and KVM virtual machines from the same instance list',
      'OS templates stay in sync with the images your node already has',
      'Per-node CPU and memory limits, with a hard server cap per node',
      'Live CPU, RAM, disk and bandwidth sampled from Incus, not estimated',
    ],
    shot: {
      src: '/shots/server.webp',
      alt: 'Server detail with resources, power controls and snapshots',
      caption: 'Server detail: resources, power and snapshots for one instance.',
    },
  },
  {
    icon: TerminalWindow,
    title: 'A console and snapshots that behave',
    lead: 'The console is a real PTY over a websocket, not a log tail. Snapshots are Incus snapshots, so a rollback restores disk state, not a backup you hope is recent.',
    points: [
      'Attach to a running instance, resize the terminal, refresh without dropping the session',
      'Take a snapshot before an upgrade and restore it in one click',
      'Rebuild an instance from a template when a rollback is not enough',
      'Reinstall the OS on a bare server without deleting the record',
    ],
    shot: {
      src: '/shots/console.webp',
      alt: 'Browser console attached to a running instance',
      caption: 'A real terminal, straight from the browser.',
    },
  },
  {
    icon: Globe,
    title: 'Networking without the iptables homework',
    lead: 'Instances sit on an Incus bridge with private addresses. Publishing a service is a port forward with a description and protocol, and Solstice cleans it up when the instance goes.',
    points: [
      'Port forwards for TCP, UDP or both, with a description you will still understand later',
      'Forwards are freed automatically when an instance is deleted or rebuilt',
      'Firewall rules per instance through an Incus network ACL',
      'SSH access with a generated password or your own key, on a forward you control',
    ],
  },
  {
    icon: EnvelopeSimple,
    title: 'Mail that actually leaves the box',
    lead: 'Sign-in links need a sender, and a fresh install has no mail server. Solstice Cloud Relay is free, sends about 30 messages a day per install, and suspends abusive instances by itself.',
    points: [
      'Cloud Relay configured by the installer — no SMTP credentials to find on day one',
      'Bring your own SMTP server when you would rather not relay',
      'Per-install tokens, rate limits and abuse suspension handled by the relay',
      'Sign-in codes, email changes and announcements all use the same path',
    ],
  },
  {
    icon: Fingerprint,
    title: 'Sign-in that does not need a password',
    lead: 'Passkeys on day one, any OAuth2 or OIDC provider for the rest, and API keys you can expire. There is no password to leak because there is no password.',
    points: [
      'Passkeys / WebAuthn, with recovery codes',
      'OAuth2 and OIDC providers, self-configured per panel',
      'Scoped API keys with expiry',
      'TOTP two-factor for the accounts that need a second factor',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Admin, quotas and an audit trail',
    lead: 'Everything an operator needs lives in one control center: nodes, locations, templates, users, quotas, ports and mail settings — with an activity log behind all of it.',
    points: [
      'Nodes and locations, with capacity and maintenance state',
      'Templates grouped per OS family, editable without touching a JSON file',
      'Per-user quotas for servers, memory, disk and port forwards',
      'Activity log covering sign-ins, power actions, snapshots and admin changes',
    ],
    shot: {
      src: '/shots/admin.webp',
      alt: 'Admin control center with nodes, templates and mail settings',
      caption: 'Control center: nodes, templates, users and mail in one place.',
    },
  },
]

function Group_({ group, index }: { group: Group; index: number }) {
  const Icon = group.icon
  const flip = index % 2 === 1

  return (
    <section className="border-t border-white/5 py-16 lg:py-20">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 sm:px-8 lg:grid-cols-12 lg:gap-14">
        <Reveal className={flip ? 'lg:col-span-6 lg:order-2' : 'lg:col-span-6'}>
          <Icon size={24} weight="duotone" className="text-sun-300" aria-hidden />
          <h2 className="mt-4 text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem]">
            {group.title}
          </h2>
          <p className="mt-4 max-w-[58ch] text-pretty text-[15px] leading-relaxed text-white/55">
            {group.lead}
          </p>

          <ul className="mt-6 space-y-3">
            {group.points.map((point) => (
              <li key={point} className="flex gap-3 text-[14px] leading-relaxed text-white/65">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sun-400/80" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal
          delay={0.08}
          className={flip ? 'lg:col-span-6 lg:order-1' : 'lg:col-span-6'}
        >
          {group.shot ? (
            <figure>
              <div className="overflow-hidden rounded-panel border border-white/8 bg-[#0d141d]">
                <img
                  src={group.shot.src}
                  alt={group.shot.alt}
                  width={1600}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="mt-3 text-[13px] text-white/40">{group.shot.caption}</figcaption>
            </figure>
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center rounded-panel border border-white/8 bg-[#0d141d] p-8">
              <div className="w-full space-y-3 font-mono text-[12.5px] leading-relaxed text-white/40">
                {group.points.slice(0, 3).map((point, i) => (
                  <p key={point} className="flex gap-2">
                    <span className="text-sun-400/70">{String(i + 1).padStart(2, '0')}</span>
                    <span className="truncate">{point.split(' ').slice(0, 7).join(' ')}…</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}

export function FeaturesPage() {
  return (
    <SiteShell path="/features/">
      <PageHeader eyebrow="Features" title="Everything the panel does.">
        <p>
          Six areas, one panel. Nothing here is a roadmap item — it ships in the installer you can
          run right now.
        </p>
      </PageHeader>

      {GROUPS.map((group, i) => (
        <Group_ key={group.title} group={group} index={i} />
      ))}

      <section className="border-t border-white/5 bg-[#0c131b] py-16">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">What it is not</h2>
            <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-white/55">
              No control plane, no telemetry, no seat licence. Solstice does not phone home, and the
              panel talks to Incus directly on the machine it runs on.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="rounded-panel border border-white/8 bg-[#101822] p-6">
              <div className="flex items-center gap-2 text-[13px] text-white/50">
                <Key size={16} className="text-sun-300" aria-hidden /> Prefer to read the code?
              </div>
              <a
                href="https://github.com/heyitslumi/solstice"
                className="mt-3 inline-flex items-center gap-2 text-[14px] text-sun-300 hover:text-sun-200"
              >
                github.com/heyitslumi/solstice →
              </a>
              <div className="mt-5 flex items-center gap-2 text-[13px] text-white/50">
                <CloudArrowUp size={16} className="text-sun-300" aria-hidden /> Ready to try it?
              </div>
              <a
                href="/install/"
                className="mt-3 inline-flex items-center gap-2 text-[14px] text-sun-300 hover:text-sun-200"
              >
                Install options →
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  )
}
