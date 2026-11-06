// TEST PAGE — frontend-only mockup of the VirtFusion-style server
// setup flow. Nothing here provisions anything: Install runs a
// simulated progress sequence. Do not wire to the API until the
// layout is approved. Route: /servers/setup (test).
import { CaretDown } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type ApiSshKey } from '@/lib/api'

interface OsOption {
  id: string
  name: string
  version: string
  variant: string
  group: string
}

const SWAPS = ['None', '256 MB', '512 MB', '768 MB', '1 GB', '1.5 GB']
const DNS_PROVIDERS: Array<{ slug: string | null; name: string; primary: string; secondary: string }> = [
  { slug: null, name: 'System Default', primary: '8.8.8.8', secondary: '8.8.4.4' },
  { slug: 'google', name: 'Google', primary: '8.8.8.8', secondary: '8.8.4.4' },
  { slug: 'cloudflare', name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1' },
  { slug: 'quad9', name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112' },
  { slug: null, name: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220' },
  { slug: 'adguard', name: 'AdGuard', primary: '94.140.14.14', secondary: '94.140.15.15' },
  { slug: 'mullvad', name: 'Mullvad', primary: '193.138.218.74', secondary: '193.138.218.75' },
  { slug: null, name: 'Canadian Shield', primary: '93.146.6.10', secondary: '93.146.6.11' },
  { slug: null, name: 'LibreDNS', primary: '116.203.185.107', secondary: '116.203.185.108' },
  { slug: null, name: 'DNS.Watch', primary: '84.200.69.80', secondary: '84.200.70.40' },
  { slug: null, name: 'Yandex', primary: '77.88.8.8', secondary: '77.88.8.1' },
]

const DISTRO_SLUG: Record<string, string> = {
  debian: 'debian',
  ubuntu: 'ubuntu',
  almalinux: 'almalinux',
  almaLinux: 'almalinux',
  centos: 'centos',
  fedora: 'fedora',
  rocky: 'rockylinux',
  opensuse: 'opensuse',
  oracle: 'oracle',
}

function slugFor(group: string): string | null {
  const normalized = group.toLowerCase().replace(/[^a-z]/g, '')
  for (const [key, slug] of Object.entries(DISTRO_SLUG)) {
    if (normalized.includes(key)) return slug
  }
  return null
}

function variantDesc(o: OsOption): string {
  const v = o.variant.toLowerCase()
  if (v.includes('minimal')) return 'Minimal installation with limited packages. New packages are easily installed using the distro package manager.'
  if (v.includes('cloud')) return 'Cloud image with cloud-init support for automated provisioning.'
  return 'Standard installation.'
}

const GROUP_DESC: Record<string, string> = {
  debian: 'Debian GNU/Linux, is a Linux distribution composed of free and open-source software, developed by the community-supported Debian Project.',
  ubuntu: 'Ubuntu is a free and open-source Linux distribution based on Debian, developed by Canonical.',
  almalinux: 'AlmaLinux is a free, open-source, RHEL-compatible Linux distribution.',
  centos: 'CentOS is a free, open-source, RHEL-compatible Linux distribution.',
  fedora: 'Fedora is a free, open-source Linux distribution created by the Fedora Project.',
  rockylinux: 'Rocky Linux is a community enterprise operating system, binary-compatible with RHEL.',
  opensuse: 'openSUSE is a free, open-source Linux distribution developed by the openSUSE Project.',
  oracle: 'Oracle Linux is a free, open-source Linux distribution based on RHEL.',
}

function groupDesc(group: string): string {
  return GROUP_DESC[group.toLowerCase().replace(/[^a-z]/g, '')] || 'Linux distribution images for Incus.'
}

function lineTime(i: number): string {
  const d = new Date(Date.now() - (60 - i) * 1000)
  return d.toTimeString().slice(0, 8)
}

function tzOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date())
    const off = parts.find((p) => p.type === 'timeZoneName')?.value || ''
    return off.replace('GMT', 'UTC')
  } catch {
    return ''
  }
}

function DnsDropdown({
  value,
  onChange,
  secondary,
}: {
  value: number
  onChange: (i: number) => void
  secondary?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const current = DNS_PROVIDERS[value]
  const ip = secondary ? current.secondary : current.primary
  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${inputClass} flex h-auto items-center gap-3 py-2 text-left`}
      >
        {current.slug ? (
          <img src={`https://cdn.simpleicons.org/${current.slug}`} alt="" className="size-4 flex-none" />
        ) : (
          <span className="flex size-4 flex-none items-center justify-center rounded-full bg-field text-[9px] font-bold text-fg-muted">{current.name[0]}</span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{current.name}</span>
          {ip && <span className="block text-[11px] text-fg-subtle">{ip}</span>}
        </span>
        <CaretDown size={14} className={`ml-auto flex-none text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-36 overflow-y-auto rounded-control border border-border bg-surface p-1 shadow-xl">
          {DNS_PROVIDERS.map((d, i) => {
            const dip = secondary ? d.secondary : d.primary
            return (
              <button
                key={d.name}
                type="button"
                onClick={() => { onChange(i); setOpen(false) }}
                className={`flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left hover:bg-field ${i === value ? 'bg-field' : ''}`}
              >
                {d.slug ? (
                  <img src={`https://cdn.simpleicons.org/${d.slug}`} alt="" className="size-4 flex-none" />
                ) : (
                  <span className="flex size-4 flex-none items-center justify-center rounded-full bg-field text-[9px] font-bold text-fg-muted">{d.name[0]}</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{d.name}</span>
                  {dip && <span className="block text-[11px] text-fg-subtle">{dip}</span>}
                </span>
                {i === value && <span className="ml-auto font-bold text-emerald-500">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputClass =
  'h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none'

export function ServerSetupPage() {
  const [osOptions, setOsOptions] = useState<OsOption[]>([])
  const [sshKeys, setSshKeys] = useState<ApiSshKey[]>([])
  const [selectedOs, setSelectedOs] = useState<OsOption | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [swap, setSwap] = useState('512 MB')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [hostname, setHostname] = useState('')
  const [tz, setTz] = useState('Europe/Paris')
  const [dns1, setDns1] = useState(0)
  const [dns2, setDns2] = useState(0)
  const [directSsh, setDirectSsh] = useState(true)
  const [advOpen, setAdvOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [phase, setPhase] = useState<'form' | 'progress' | 'panel'>('form')
  const [step, setStep] = useState(0)
  const [password, setPassword] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])

  useEffect(() => {
    let active = true
    ;(async () => {
      // Prefer the rich admin shape (group/version/variant), fall back to public list.
      const adminRes = await api.adminListOsTemplates()
      if (active && adminRes.ok) {
        setOsOptions(
          adminRes.data.map((t) => ({
            id: t.id,
            name: t.name,
            version: t.version || '',
            variant: t.variant || '',
            group: t.groupName || t.os || t.name,
          })),
        )
      } else {
        const pub = await api.listOsTemplates()
        if (active && pub.ok) {
          setOsOptions(
            pub.data.templates.map((t) => ({ id: t.id, name: t.name, version: '', variant: '', group: t.name })),
          )
        }
      }
      const keysRes = await api.listSshKeys()
      if (active && keysRes.ok) setSshKeys(keysRes.data.keys)
    })()
    return () => {
      active = false
    }
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, OsOption[]>()
    for (const o of osOptions) {
      if (!map.has(o.group)) map.set(o.group, [])
      map.get(o.group)!.push(o)
    }
    return [...map.entries()]
  }, [osOptions])

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone') as string[]
    } catch {
      return ['Europe/Paris', 'Europe/London', 'UTC']
    }
  }, [])

  const noKeysSelected = selectedKeys.size === 0
  const osLabel = selectedOs
    ? `${selectedOs.name} ${selectedOs.version} ${selectedOs.variant}`.trim()
    : ''

  function toggleKey(id: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startInstall() {
    if (!selectedOs) return
    setConfirmOpen(false)
    setPhase('progress')
    setStep(0)
    setLogLines([])
    const push = (line: string) => setLogLines((prev) => [...prev, line])
    push(`→ Creating server "${name || 'server'}"`)
    push(`→ Resolving template ${osLabel} (${selectedOs.id})`)
    const total = 6
    let i = 0
    const tick = () => {
      i++
      setStep(i)
      if (i === 1) {
        push('✓ Server created')
        push('→ Pulling OS image (debian/trixie/cloud)')
      } else if (i === 2) {
        push('✓ Image ready (386 MB)')
        push('→ Configuring cloud-init')
      } else if (i === 3) {
        push('✓ cloud-init configured (hostname, timezone, dns)')
        push(noKeysSelected ? '→ Generating root password' : `→ Injecting ${selectedKeys.size} SSH key(s)`)
      } else if (i === 4) {
        push(noKeysSelected ? '✓ Root password generated' : '✓ SSH keys injected')
        push('→ Starting server')
      } else if (i === 5) {
        push('✓ Server started')
        push('→ Waiting for network')
      }
      if (i >= total) {
        push('✓ Network OK — 5.231.32.70')
        push('✓ Provisioning complete')
        setTimeout(() => {
          if (noKeysSelected) {
            const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
            const bytes = crypto.getRandomValues(new Uint8Array(12))
            setPassword([...bytes].map((b) => alphabet[b % alphabet.length]).join(''))
          }
          setPhase('panel')
        }, 900)
        return
      }
      setTimeout(tick, 800)
    }
    setTimeout(tick, 800)
  }

  if (phase === 'panel') {
    return (
      <AppShell title="Server Setup" description="TEST PAGE — frontend mockup only, install does not provision anything">
        <div className="mx-auto -mt-8 w-full max-w-4xl lg:-mt-10">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{name || 'my-server'}</h1>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
              ● Running
            </span>
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm">Reboot</Button>
              <Button variant="secondary" size="sm">Shutdown</Button>
              <Button variant="secondary" size="sm">Console</Button>
            </span>
          </div>
          <div className="mt-6 rounded-panel border border-border bg-surface p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-fg-subtle">IPv4</p><p className="font-medium">5.231.32.70</p></div>
              <div><p className="text-fg-subtle">Operating System</p><p className="font-medium">{osLabel}</p></div>
              <div><p className="text-fg-subtle">SSH</p><p className="font-mono text-[13px]">ssh -p 22222 root@5.231.32.70</p></div>
              <div><p className="text-fg-subtle">Timezone</p><p className="font-medium">{tz}</p></div>
            </div>
            {password && (
              <div className="mt-4 flex items-center justify-between rounded-control bg-field px-3 py-2 text-[13px]">
                <span>Root password (copy it now, it won't be shown again): <code className="font-mono">{password}</code></span>
                <Button variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(password)}>Copy</Button>
              </div>
            )}
            <p className="mt-4 text-center text-xs text-fg-subtle">TEST PAGE — mock control panel, nothing was provisioned</p>
          </div>
        </div>
      </AppShell>
    )
  }

  if (phase === 'progress') {
    const steps = [
      'Creating server',
      'Pulling OS image',
      'Configuring cloud-init',
      noKeysSelected ? 'Generating root password' : `Injecting ${selectedKeys.size} SSH key(s)`,
      'Starting server',
      'Waiting for network',
    ]
    return (
      <AppShell title="Server Setup" description="TEST PAGE — simulating provisioning">
        <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
          <div className="flex flex-1 flex-col items-center justify-center rounded-panel border border-border bg-surface p-10 text-center">
            <div className="size-24 animate-spin rounded-full border-[6px] border-fg-subtle/25 border-t-accent" />
            <h2 className="mt-8 text-2xl font-semibold">Installing {osLabel}...</h2>
            <p className="mt-2 text-base text-fg-subtle">{steps[Math.min(step, steps.length - 1)]}</p>
            <div className="mt-8 w-full max-w-xl">
              <div className="relative h-4 overflow-hidden rounded-full bg-field">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(step / steps.length) * 100}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white mix-blend-difference">{Math.round((step / steps.length) * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-panel border border-border bg-black">
            <div className="border-b border-border bg-surface px-4 py-2.5">
              <span className="text-[12px] text-fg-subtle">provisioning log</span>
            </div>
            <div className="min-h-[40vh] flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-loose">
              {logLines.map((line, i) => (
                <p key={i} className={line.includes('✓') || line.includes('OK') ? 'text-emerald-400' : line.includes('→') ? 'text-accent' : 'text-fg-muted'}>
                  <span className="mr-4 text-fg-subtle">{lineTime(i)}</span>{line}
                </p>
              ))}
              {step < steps.length && <p className="animate-pulse text-fg-subtle">▌</p>}
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Server Setup" description="TEST PAGE — frontend mockup only, install does not provision anything">
      <div className="mx-auto -mt-8 w-full max-w-4xl lg:-mt-10">

        <section className="mt-4">
          <h2 className="text-[15px] font-semibold">Name</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-subtle">The server name allows you to easily identify the server under your account.</p>
          <div className="mt-3 flex gap-2.5">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" />
            <Button variant="secondary" onClick={() => setName(`server-${Math.floor(Math.random() * 900 + 100)}`)}>Random</Button>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-[15px] font-semibold">Hostname <span className="ml-1 rounded bg-field px-1.5 py-0.5 text-[10px] text-fg-subtle">OPTIONAL</span></h2>
            <p className="text-[12px] text-fg-subtle">If the server requires a valid hostname, you should set it here.</p>
            <input className={`${inputClass} mt-2`} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="server.example.com" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Timezone</h2>
            <p className="text-[12px] text-fg-subtle">The timezone that should be set on the server.</p>
            <div className="relative mt-2">
              <select className={`${inputClass} appearance-none pr-8`} value={tz} onChange={(e) => setTz(e.target.value)}>
                {timezones.map((z) => (
                  <option key={z} value={z}>({tzOffsetLabel(z)}) {z}</option>
                ))}
              </select>
              <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-semibold">Operating System</h2>
          <p className="text-[12px] text-fg-subtle">Select the operating system that you would like to be automatically installed on the server.</p>
          <div className="mt-3 space-y-2">
            {groups.map(([group, options]) => (
              <div key={group} className="overflow-hidden rounded-panel border border-border bg-surface">
                <button
                  type="button"
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium ${openGroup === group ? 'bg-surface-2' : ''}`}
                  onClick={() => setOpenGroup(openGroup === group ? null : group)}
                >
                  {slugFor(group) && (
                    <img
                      src={`https://cdn.simpleicons.org/${slugFor(group)}`}
                      alt=""
                      className="size-5 flex-none"
                      loading="lazy"
                    />
                  )}
                  {group}
                  <span className="rounded-full bg-field px-2 py-0.5 text-[11px] text-fg-subtle">{options.length}</span>
                  <CaretDown size={15} className={`ml-auto flex-none text-fg-subtle transition-transform ${openGroup === group ? 'rotate-180' : ''}`} />
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: openGroup === group ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <p className="px-4 pt-4 text-[12px] leading-relaxed text-fg-subtle">{groupDesc(group)}</p>
                    <div className="flex flex-col gap-3 p-4">
                    {options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSelectedOs(o)}
                        className={`relative w-full rounded-control border bg-field text-left transition-all ${selectedOs?.id === o.id ? 'border-emerald-500 p-4' : 'border-border p-4 hover:border-fg-subtle/40'}`}
                      >
                        {selectedOs?.id === o.id && <span className="absolute right-3 top-3 font-bold text-emerald-500">✓</span>}
                        <div className="flex items-center gap-2.5">
                          {slugFor(group) && (
                            <img src={`https://cdn.simpleicons.org/${slugFor(group)}`} alt="" className="size-4 flex-none opacity-80" loading="lazy" />
                          )}
                          <p className="text-sm font-medium">{`${o.name} ${o.version} ${o.variant}`.trim()}</p>
                        </div>
                        <p className={`text-fg-subtle ${selectedOs?.id === o.id ? 'mt-1 text-[12px]' : 'mt-1 text-[12px]'}`}>{variantDesc(o)}</p>
                      </button>
                    ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {osOptions.length === 0 && <p className="text-sm text-fg-subtle">No OS templates available.</p>}
          </div>
        </section>

        {selectedOs && (
          <>
            <section className="mt-8">
              <h2 className="text-[15px] font-semibold">Swap Space</h2>
              <p className="text-[12px] text-fg-subtle">Swap acts as backup memory to prevent crashes when physical memory is full. The chosen amount will be reserved on the storage disk.</p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {SWAPS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSwap(s)}
                    className={`relative flex-1 rounded-control border px-6 py-3 text-[14px] font-medium transition-all ${swap === s ? 'border-emerald-500 bg-emerald-500/10' : 'border-border bg-field hover:border-fg-subtle/40'}`}
                  >
                    {swap === s && <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-emerald-950">✓</span>}
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">SSH Keys</h2>
                <Button size="sm" onClick={() => alert('demo: would open add-key modal')}>Add Key</Button>
              </div>
              <p className="text-[12px] text-fg-subtle">{sshKeys.length} slots used, {Math.max(0, 50 - sshKeys.length)} remaining.</p>
              <p className="text-[12px] text-fg-subtle">The selected SSH keys will be configured under the root user when the operating system is installed.</p>
              {sshKeys.length === 0 ? (
                <div className="mt-2 rounded-panel border border-border bg-surface p-8 text-center text-sm text-fg-subtle">No SSH Keys found</div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {sshKeys.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKey(k.id)}
                      className={`relative rounded-panel border bg-surface p-4 text-left ${selectedKeys.has(k.id) ? 'border-emerald-500' : 'border-border'}`}
                    >
                      {selectedKeys.has(k.id) && <span className="absolute right-0 top-0 flex size-5 items-center justify-center rounded-bl-lg bg-emerald-500 text-[11px] font-bold text-emerald-950">✓</span>}
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="text-[12px] text-fg-subtle">Owner: You</p>
                      <p className="text-[12px] text-fg-subtle">Created: {new Date(k.createdAt).toLocaleString()}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {noKeysSelected && (
              <div className="mt-8 flex gap-3 rounded-panel border border-warning/50 bg-warning/10 p-4">
                <span className="flex size-6 flex-none items-center justify-center rounded bg-warning font-bold text-warning">i</span>
                <div>
                  <p className="text-sm font-semibold">No SSH Keys Selected</p>
                  <p className="text-[12px] text-fg-muted">Adding an SSH key will help keep your server secure by allowing us to disable password authentication. If you don't add one, we will enable password authentication and email you the root/admin password once the server has been built.</p>
                </div>
              </div>
            )}
          </>
        )}

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Advanced</h2>
            <Button variant="secondary" size="sm" onClick={() => setAdvOpen(!advOpen)}>
              {advOpen ? 'Hide Advanced Options' : 'Advanced Options'}
            </Button>
          </div>
          <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: advOpen ? '1fr' : '0fr' }}>
            <div style={{ overflow: advOpen ? 'visible' : 'hidden' }}>
          <div className="mt-3 rounded-panel border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Direct SSH</p>
                <p className="text-[12px] text-fg-subtle">Automatically enable SSH port forwarding when the server is built.</p>
              </div>
              <button type="button" onClick={() => setDirectSsh(!directSsh)} className={`h-6 w-11 flex-none rounded-full p-0.5 ${directSsh ? 'bg-emerald-500' : 'bg-field'}`}>
                <span className={`block size-5 rounded-full bg-white transition-transform ${directSsh ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
          <h2 className="mt-6 text-[15px] font-semibold">IPv4 Public DNS Resolvers</h2>
          <p className="text-[12px] text-fg-subtle">A server requires two DNS resolvers. You may swap the system defaults for a preferred set of public resolvers.</p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] text-fg-subtle">Primary</p>
              <DnsDropdown value={dns1} onChange={setDns1} />
            </div>
            <div>
              <p className="text-[12px] text-fg-subtle">Secondary</p>
              <DnsDropdown value={dns2} onChange={setDns2} secondary />
            </div>
          </div>
            </div>
          </div>
        </section>

        <Button className="mt-8 w-full" disabled={!selectedOs || !name.trim()} onClick={() => setConfirmOpen(true)}>
          {selectedOs ? `Install with ${osLabel.replace(' Minimal', '')}` : 'Install'}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-center">Are you sure you want to install {osLabel} on this server{noKeysSelected ? ' without any SSH keys' : ''}?</DialogTitle>
          <DialogDescription className="text-center">This is a test page — confirming will only simulate provisioning.</DialogDescription>
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={startInstall}>Install Now</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
