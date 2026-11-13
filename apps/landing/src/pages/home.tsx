import {
  Check,
  ClockCounterClockwise,
  Copy,
  EnvelopeSimple,
  Fingerprint,
  GithubLogo,
  Globe,
  HardDrives,
  TerminalWindow,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

import { Reveal } from '@/components/reveal'
import { INSTALL, SiteShell } from '@/components/site-shell'
import { useCopy } from '@/components/use-copy'

const SHOTS = [
  {
    src: '/shots/overview.webp',
    alt: 'Solstice overview: instance counts, node capacity and recent activity',
    title: 'Overview',
    body: 'Every instance, node and quota on one screen.',
    span: 'lg:col-span-8',
  },
  {
    src: '/shots/server.webp',
    alt: 'Solstice server detail: resources, power controls and snapshots',
    title: 'Server detail',
    body: 'Resources, power and snapshots per instance.',
    span: 'lg:col-span-4',
  },
  {
    src: '/shots/console.webp',
    alt: 'Solstice browser console attached to a running instance',
    title: 'Console',
    body: 'A real terminal, straight from the browser.',
    span: 'lg:col-span-4',
  },
  {
    src: '/shots/admin.webp',
    alt: 'Solstice admin control center: nodes, templates and mail settings',
    title: 'Control center',
    body: 'Nodes, templates, users and mail in one place.',
    span: 'lg:col-span-8',
  },
]

type Feature = {
  icon: React.ComponentType<{ size?: number; weight?: 'duotone'; className?: string }>
  title: string
  body: string
  detail?: string | string[]
  tint?: boolean
}

const FEATURES: Feature[] = [
  {
    icon: HardDrives,
    title: 'Incus does the hard part',
    body: 'System containers and full KVM virtual machines, with per-node capacity, live CPU detection and OS templates that stay in sync.',
    detail: ['lxc', 'kvm', 'templates'],
    tint: true,
  },
  {
    icon: TerminalWindow,
    title: 'A console that works',
    body: 'Attach to a running instance over a websocket. Resize, scroll, survive a refresh.',
  },
  {
    icon: ClockCounterClockwise,
    title: 'Snapshots, not regrets',
    body: 'Take one before an upgrade and roll back when it goes wrong.',
  },
  {
    icon: Globe,
    title: 'Port forwards, no iptables homework',
    body: 'Publish a container port on the host with a description and protocol. Freed automatically when the instance goes.',
  },
  {
    icon: EnvelopeSimple,
    title: 'Mail that leaves the box',
    body: 'Sign-in codes need a sender. Solstice Cloud Relay is free forever, about 30 messages a day, and suspends abusive instances by itself.',
    detail: 'mail_provider=solstice',
    tint: true,
  },
  {
    icon: Fingerprint,
    title: 'Sign in your way',
    body: 'Passkeys, any OAuth2 or OIDC provider, and API keys you can expire. Sign-in itself is a code or a link, never a password to leak.',
  },
]

function Hero() {
  const { copied, copy } = useCopy()
  const reduce = useReducedMotion()

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-36 lg:pb-28">
      <div className="pointer-events-none absolute inset-0 bg-grid" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #fd9d1e 0%, #fe5c36 45%, transparent 70%)' }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-10">
        <motion.div
          className="lg:col-span-7"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-mono text-[11px] tracking-[0.18em] text-sun-300/90 uppercase">
            Open source · self-hosted
          </p>

          <h1 className="mt-5 text-[2.25rem] leading-[1.06] font-semibold tracking-[-0.03em] sm:text-5xl lg:text-[3.5rem]">
            <span className="block">Your own VPS panel.</span>
            <span className="block">One command.</span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-pretty text-[16.5px] leading-relaxed text-white/60">
            Incus-native instances, a real console, snapshots and mail that works, on hardware you
            already pay for.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copy}
              className="group flex items-center gap-2.5 rounded-control bg-sun-400 px-4 py-3 text-[14px] font-medium text-[#241503] transition-all hover:bg-sun-300 active:translate-y-px"
            >
              {copied ? <Check size={17} weight="bold" aria-hidden /> : <Copy size={17} aria-hidden />}
              {copied ? 'Copied' : 'Copy install command'}
            </button>
            <a
              href="https://demo.solstice.host"
              className="flex items-center gap-2 rounded-control border border-white/12 px-4 py-3 text-[14px] text-white/75 transition-colors hover:border-white/25 hover:text-white"
            >
              Try the live demo
            </a>
            <a
              href="https://github.com/heyitslumi/solstice"
              className="flex items-center gap-2 rounded-control border border-white/12 px-4 py-3 text-[14px] text-white/75 transition-colors hover:border-white/25 hover:text-white"
            >
              <GithubLogo size={17} weight="fill" aria-hidden />
              Source
            </a>
          </div>

          <p className="mt-6 font-mono text-[12px] text-white/35">
            Debian 12+ · Ubuntu 22.04+ · amd64 / arm64
          </p>
        </motion.div>

        <motion.div
          className="lg:col-span-5"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="overflow-hidden rounded-panel border border-white/10 bg-[#0d141d] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
              <span className="size-2.5 rounded-full bg-white/12" />
              <span className="size-2.5 rounded-full bg-white/12" />
              <span className="size-2.5 rounded-full bg-white/12" />
              <span className="ml-2 font-mono text-[11px] text-white/35">root@panel</span>
            </div>

            <div className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.85] sm:px-5">
              <p className="text-white/80">
                <span className="text-sun-400">$</span> {INSTALL}
              </p>
              <p className="mt-3 text-white/40">[solstice] → preflight</p>
              <p className="text-white/40">[solstice] ✓ preflight (0s)</p>
              <p className="text-white/40">[solstice] → dependencies</p>
              <p className="text-white/40">[solstice] ✓ dependencies (178s)</p>
              <p className="text-white/40">[solstice] → database</p>
              <p className="text-white/40">[solstice] ✓ database (155s)</p>
              <p className="text-white/40">[solstice] → incus</p>
              <p className="text-white/40">[solstice] ✓ incus (41s)</p>
              <p className="text-white/40">[solstice] → build</p>
              <p className="text-white/40">[solstice] ✓ build (128s)</p>
              <p className="text-white/40">[solstice] → caddy</p>
              <p className="text-white/40">[solstice] ✓ caddy (4s)</p>
              <p className="mt-3 text-sun-300">Solstice is installed.</p>
              <p className="text-white/55">Panel: https://panel.example.com</p>
              <p className="text-white/55">Admin: you@example.com</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Screenshots() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
      <Reveal>
        <h2 className="max-w-[22ch] text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-[2.5rem]">
          The whole panel, not a teaser.
        </h2>
        <p className="mt-4 max-w-[60ch] text-pretty text-[15.5px] leading-relaxed text-white/55">
          These are screenshots of a running install, taken from the{' '}
          <a href="https://demo.solstice.host" className="text-sun-300 hover:text-sun-200">
            live demo instance
          </a>
          .
        </p>
      </Reveal>

      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        {SHOTS.map((shot, i) => (
          <Reveal key={shot.src} delay={i * 0.05} className={shot.span}>
            <figure className="group">
              <div className="overflow-hidden rounded-panel border border-white/8 bg-[#0d141d]">
                <img
                  src={shot.src}
                  alt={shot.alt}
                  width={1600}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.012]"
                />
              </div>
              <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[13.5px] font-medium text-white/85">{shot.title}</span>
                <span className="text-[13px] text-white/40">{shot.body}</span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="border-t border-white/5 bg-[#0c131b] py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <Reveal>
          <h2 className="max-w-[24ch] text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-[2.5rem]">
            Built on Incus, not on a promise.
          </h2>
          <p className="mt-4 max-w-[62ch] text-pretty text-[15.5px] leading-relaxed text-white/55">
            Every screen talks to the Incus daemon on your own machine. No control plane in the
            middle, no per-seat licence, no vendor holding the keys.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            return (
              <Reveal key={feature.title} delay={i * 0.04}>
                <article
                  className={`flex h-full flex-col justify-between gap-8 rounded-panel border p-6 ${
                    feature.tint
                      ? 'border-sun-500/20 bg-gradient-to-br from-sun-500/12 via-[#101822] to-[#101822]'
                      : 'border-white/8 bg-[#101822]'
                  }`}
                >
                  <div>
                    <Icon size={22} className="text-sun-300" weight="duotone" aria-hidden />
                    <h3 className="mt-4 text-[17px] font-medium tracking-[-0.01em]">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 max-w-[46ch] text-[14px] leading-relaxed text-white/55">
                      {feature.body}
                    </p>
                  </div>

                  {feature.detail && Array.isArray(feature.detail) && (
                    <div className="flex flex-wrap gap-1.5">
                      {feature.detail.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] text-white/45"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {feature.detail && !Array.isArray(feature.detail) && (
                    <code className="rounded-md border border-white/10 bg-black/25 px-2.5 py-1.5 font-mono text-[11.5px] text-sun-200/80">
                      {feature.detail}
                    </code>
                  )}
                </article>
              </Reveal>
            )
          })}
        </div>

        <Reveal delay={0.1}>
          <a
            href="/features/"
            className="mt-10 inline-flex items-center gap-2 text-[14px] text-sun-300 transition-colors hover:text-sun-200"
          >
            Every feature, in detail →
          </a>
        </Reveal>
      </div>
    </section>
  )
}

function Cta() {
  const { copied, copy } = useCopy()
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
      <Reveal>
        <div className="rounded-panel border border-white/8 bg-[#101822] p-8 sm:p-12">
          <h2 className="max-w-[20ch] text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-[2.5rem]">
            Three steps, one of them is typing.
          </h2>
          <p className="mt-4 max-w-[60ch] text-pretty text-[15.5px] leading-relaxed text-white/55">
            Run the installer on a fresh Debian or Ubuntu box, point DNS at it, register with the
            email you gave it. That account is the administrator.
          </p>

          <button
            type="button"
            onClick={copy}
            className="mt-8 flex w-full items-center justify-between gap-4 rounded-control border border-white/10 bg-[#0d141d] px-4 py-3.5 text-left transition-colors hover:border-white/20"
          >
            <code className="truncate font-mono text-[12.5px] text-white/70">{INSTALL}</code>
            <span className="shrink-0 text-sun-300">
              {copied ? <Check size={17} weight="bold" /> : <Copy size={17} />}
            </span>
          </button>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
            <a href="/install/" className="text-sun-300 hover:text-sun-200">
              Install options and requirements →
            </a>
            <a href="/architecture/" className="text-white/55 hover:text-white">
              How it fits together →
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export function HomePage() {
  return (
    <SiteShell path="/">
      <Hero />
      <Screenshots />
      <Features />
      <Cta />
    </SiteShell>
  )
}
