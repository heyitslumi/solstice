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
import { useEffect, useState } from 'react'

const INSTALL = 'curl -fsSL https://solstice.host/install.sh | sudo bash'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Screenshots', href: '#screenshots' },
  { label: 'Install', href: '#install' },
  { label: 'Requirements', href: '#requirements' },
]

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

const STEPS = [
  {
    title: 'Run the command',
    body: 'On a fresh Debian or Ubuntu box. It asks for your hostname and operator email, then installs Node, Postgres, Incus and Caddy.',
  },
  {
    title: 'Point DNS at it',
    body: 'An A record is enough. Caddy issues and renews the certificate on first request.',
  },
  {
    title: 'Register your admin',
    body: 'Open the panel and sign up with the email you gave the installer. That account is the administrator.',
  },
]

const REQUIREMENTS = [
  ['OS', 'Debian 12 or 13, Ubuntu 22.04 or 24.04'],
  ['Architecture', 'amd64 or arm64'],
  ['Memory', '1 GB minimum, 2 GB or more recommended'],
  ['Disk', '4 GB free, more for instances'],
  ['Ports', '80 and 443 for automatic TLS'],
  ['KVM', 'Optional. Without /dev/kvm you get containers only.'],
]

function useCopy() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return { copied, copy }
}

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Mark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd05e" />
          <stop offset="55%" stopColor="#fd9d1e" />
          <stop offset="100%" stopColor="#fe5c36" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="7" fill="url(#sun)" />
      <g stroke="url(#sun)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M16 2v4M16 26v4M2 16h4M26 16h4" />
        <path d="M6.2 6.2l2.8 2.8M23 23l2.8 2.8M25.8 6.2L23 9M9 23l-2.8 2.8" opacity="0.75" />
      </g>
    </svg>
  )
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-brand-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">Solstice</span>
        </a>

        <nav className="hidden items-center gap-7 text-[13.5px] text-white/55 lg:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/heyitslumi/solstice"
            className="flex items-center gap-2 rounded-control border border-white/10 px-3 py-2 text-[13px] text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            <GithubLogo size={16} weight="fill" aria-hidden />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href="#install"
            className="rounded-control bg-sun-400 px-3.5 py-2 text-[13px] font-medium text-[#241503] transition-transform hover:bg-sun-300 active:translate-y-px"
          >
            Install
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const { copied, copy } = useCopy()
  const reduce = useReducedMotion()

  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-36 lg:pb-28">
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
              href="https://github.com/heyitslumi/solstice"
              className="flex items-center gap-2 rounded-control border border-white/12 px-4 py-3 text-[14px] text-white/75 transition-colors hover:border-white/25 hover:text-white"
            >
              <GithubLogo size={17} weight="fill" aria-hidden />
              Read the source
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
    <section id="screenshots" className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
      <Reveal>
        <h2 className="max-w-[22ch] text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-[2.5rem]">
          The whole panel, not a teaser.
        </h2>
        <p className="mt-4 max-w-[60ch] text-pretty text-[15.5px] leading-relaxed text-white/55">
          These are screenshots of a running install, taken from the demo instance linked in the
          footer.
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
    <section id="features" className="border-t border-white/5 bg-[#0c131b] py-20 lg:py-28">
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
      </div>
    </section>
  )
}

function Install() {
  const { copied, copy } = useCopy()
  const reduce = useReducedMotion()

  return (
    <section id="install" className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <div>
            <h2 className="max-w-[18ch] text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-[2.5rem]">
              Three steps, one of them is typing.
            </h2>
            <p className="mt-4 max-w-[48ch] text-pretty text-[15.5px] leading-relaxed text-white/55">
              The installer is a single shell script. It asks before it touches anything, logs every
              step to /var/log/solstice-install.log, and refuses to report success until the API
              answers over HTTPS.
            </p>

            <button
              type="button"
              onClick={copy}
              className="mt-8 flex w-full items-center justify-between gap-4 rounded-panel border border-white/10 bg-[#0d141d] px-4 py-3.5 text-left transition-colors hover:border-white/20"
            >
              <code className="truncate font-mono text-[12.5px] text-white/70">{INSTALL}</code>
              <span className="shrink-0 text-sun-300">
                {copied ? <Check size={17} weight="bold" /> : <Copy size={17} />}
              </span>
            </button>
          </div>
        </Reveal>

        <div className="lg:col-span-7">
          <ol className="divide-y divide-white/6 border-y border-white/6">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                className="flex gap-5 py-6"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="mt-0.5 font-mono text-[12px] text-sun-400/80">0{i + 1}</span>
                <div>
                  <h3 className="text-[15.5px] font-medium">{step.title}</h3>
                  <p className="mt-1.5 max-w-[58ch] text-[14px] leading-relaxed text-white/50">
                    {step.body}
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>

          <Reveal delay={0.2}>
            <p className="mt-6 text-[13px] leading-relaxed text-white/40">
              Already installed? <code className="font-mono text-white/65">solstice upgrade</code>{' '}
              pulls, rebuilds and restarts, and{' '}
              <code className="font-mono text-white/65">solstice doctor</code> reports what is
              broken.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Requirements() {
  return (
    <section id="requirements" className="border-t border-white/5 bg-[#0c131b] py-20 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                What you need
              </h2>
              <p className="mt-3 max-w-[36ch] text-[14.5px] leading-relaxed text-white/50">
                A machine you can SSH into and a hostname pointed at it. That is the whole list.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="lg:col-span-8">
            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {REQUIREMENTS.map(([term, value]) => (
                <div key={term} className="border-t border-white/8 pt-3">
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-white/35 uppercase">
                    {term}
                  </dt>
                  <dd className="mt-1.5 text-[14px] leading-relaxed text-white/70">{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Mark className="size-6" />
          <span className="text-[14px] font-medium">Solstice</span>
          <span className="text-[13px] text-white/35">Self-hosted VPS panel</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/45">
          <a href="https://github.com/heyitslumi/solstice" className="hover:text-white">
            GitHub
          </a>
          <a href="#install" className="hover:text-white">
            Install
          </a>
          <a href="https://demo.solstice.host" className="hover:text-white">
            Live demo
          </a>
          <span className="font-mono text-[11.5px] text-white/25">
            Built on Incus · no telemetry
          </span>
        </nav>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Screenshots />
        <Features />
        <Install />
        <Requirements />
      </main>
      <Footer />
    </>
  )
}
