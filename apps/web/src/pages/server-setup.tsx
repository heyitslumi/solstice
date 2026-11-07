// VirtFusion-style server setup flow: pick OS, swap, SSH keys,
// DNS, then install. Install calls the real provisioning API.
// Route: /servers/setup (new servers) or embedded in server detail
// for bare servers awaiting their first OS install.
import { CaretDown } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

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

export function ServerSetupPage({
  instanceId: instanceIdProp,
  instanceName,
  hostMode: hostModeProp,
}: {
  instanceId?: string
  instanceName?: string
  hostMode?: 'create' | 'install' | 'rebuild'
} = {}) {
  const navigate = useNavigate()
  const routeParams = useParams<{ id?: string }>()
  const isRebuild = hostModeProp === 'rebuild'
  const instanceId = instanceIdProp || (isRebuild ? routeParams.id : undefined)
  const [osOptions, setOsOptions] = useState<OsOption[]>([])
  const [sshKeys, setSshKeys] = useState<ApiSshKey[]>([])
  const [selectedOs, setSelectedOs] = useState<OsOption | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [swap, setSwap] = useState('512 MB')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [name, setName] = useState(instanceName || '')
  useEffect(() => {
    if (!isRebuild || !instanceId) return
    let active = true
    api.getInstance(instanceId).then((res) => {
      if (active && res.ok) setName(res.data.instance.name)
    })
    return () => {
      active = false
    }
  }, [isRebuild, instanceId])
  const [hostname, setHostname] = useState('')
  const [tz, setTz] = useState('Europe/Paris')
  const [dns1, setDns1] = useState(0)
  const [dns2, setDns2] = useState(0)
  const [directSsh, setDirectSsh] = useState(true)
  const [advOpen, setAdvOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [phase, setPhase] = useState<'form' | 'progress'>('form')
  const [step, setStep] = useState(0)
  const [createError, setCreateError] = useState<string | null>(null)
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

  // No pre-selected OS; require user to pick one.
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

  async function startInstall() {
    if (!selectedOs) return
    setConfirmOpen(false)
    setPhase('progress')
    setStep(0)
    setLogLines([])
    setCreateError(null)
    const push = (line: string) => setLogLines((prev) => [...prev, line])
    push(`\u2192 Creating server "${name || 'server'}"`)
    push(`\u2192 Resolving template ${osLabel}`)

    const swapMb = swap === 'None' ? 0 : Math.round(parseFloat(swap) * (swap.includes('GB') ? 1024 : 1))
    const dnsServers = [DNS_PROVIDERS[dns1].primary, DNS_PROVIDERS[dns2].secondary].filter(Boolean)

    let stepCount = 0
    const progressTimer = setInterval(() => {
      stepCount = Math.min(stepCount + 1, 5)
      setStep(stepCount)
      if (stepCount === 1) {
        push('✓ Server created')
        push('→ Pulling OS image')
      } else if (stepCount === 2) {
        push('✓ Image ready')
        push('→ Configuring cloud-init')
      } else if (stepCount === 3) {
        push('✓ cloud-init configured (hostname, timezone, dns)')
        push(noKeysSelected ? '→ Generating root password' : `→ Injecting ${selectedKeys.size} SSH key(s)`)
      } else if (stepCount === 4) {
        push(noKeysSelected ? '✓ Root password generated' : '✓ SSH keys injected')
        push('→ Starting server')
      } else if (stepCount === 5) {
        push('✓ Server started')
        push('→ Waiting for network')
      }
    }, 5000)

    const res = isRebuild && instanceId
      ? await api.rebuildInstance(instanceId, {
          name: name.trim().toLowerCase() || undefined,
          templateId: selectedOs.id,
          hostname: hostname.trim() || undefined,
          timezone: tz,
          swapMb,
          dnsServers,
          sshKeyIds: [...selectedKeys],
          directSsh,
        })
      : instanceId
      ? await api.installOs(instanceId, {
          templateId: selectedOs.id,
          hostname: hostname.trim() || undefined,
          timezone: tz,
          swapMb,
          dnsServers,
          sshKeyIds: [...selectedKeys],
          directSsh,
        })
      : await api.createInstance({
          name: name.trim().toLowerCase(),
          type: 'kvm',
          templateId: selectedOs.id,
          hostname: hostname.trim() || undefined,
          timezone: tz,
          swapMb,
          dnsServers,
          sshKeyIds: [...selectedKeys],
          directSsh,
        })
    clearInterval(progressTimer)

    if (!res.ok) {
      // In case of a gateway timeout (504), check if the server was actually installed
      if (instanceId && (res.error.message?.includes('504') || res.error.message?.includes('timed out'))) {
        push('ℹ Checking server installation state...')
        const check = await api.getInstance(instanceId).catch(() => null)
        if (check?.ok && check.data.instance?.os) {
          push('✓ Server setup completed successfully in background')
          push('✓ Provisioning complete')
          setStep(6)
          setTimeout(() => navigate(`/servers/${instanceId}`), 1000)
          return
        }
      }
      push('✗ ' + (res.error.message || 'Provisioning failed.'))
      setCreateError(res.error.message || 'Provisioning failed.')
      return
    }

    const created = res.data
    push('\u2713 Server created')
    push('\u2192 Pulling OS image')
    push('\u2713 Image ready')
    push('\u2192 Configuring cloud-init')
    push(created.passwordEmailed ? '\u2192 Generating root password' : `\u2192 Injecting ${selectedKeys.size} SSH key(s)`)
    push(created.passwordEmailed ? '\u2713 Root password generated (emailed)' : '\u2713 SSH keys injected')
    push('\u2192 Starting server')
    push(created.sshHostPort ? `\u2713 Direct SSH enabled (port ${created.sshHostPort})` : '\u2713 Server started')
    push('\u2713 Provisioning complete')
    setStep(6)
    const targetId = created.id || instanceId
    if (targetId) {
      setTimeout(() => navigate(`/servers/${targetId}`), 1000)
    }
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
    const percent = Math.min(100, Math.round((step / steps.length) * 100))

    return (
      <AppShell title="Server Setup" description="Provisioning your server...">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4">
          {/* Main Progress Card */}
          <div className="flex flex-col items-center justify-center rounded-panel border border-border bg-surface p-8 text-center shadow-xs">
            {/* Smooth SVG Donut / Spinner */}
            <div className="relative flex size-28 items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-surface-2"
                  strokeWidth="3.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-accent transition-all duration-700 ease-out"
                  strokeDasharray={`${percent}, 100`}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="font-mono text-[20px] font-bold text-fg leading-none">
                  {percent}%
                </span>
              </div>
            </div>

            <h2 className="mt-5 text-[18px] font-semibold text-fg">
              Installing {osLabel}...
            </h2>
            <p className="mt-1 text-[13px] text-fg-subtle">
              {steps[Math.min(step, steps.length - 1)]}
            </p>

            {/* Clean Progress Bar */}
            <div className="mt-6 w-full max-w-md">
              <div className="relative h-2 overflow-hidden rounded-full bg-field">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </div>

          {createError && (
            <div className="flex items-center justify-between rounded-panel border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-300">
              <span>{createError}</span>
              {instanceId && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/servers/${instanceId}`)}
                >
                  Go to Server
                </Button>
              )}
            </div>
          )}

          {/* Minimalist Provisioning Terminal Log */}
          <div className="overflow-hidden rounded-panel border border-border bg-[#0d0e12] shadow-2xs">
            <div className="flex items-center justify-between border-b border-border/80 bg-surface/40 px-4 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                provisioning log
              </span>
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="max-h-60 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed">
              {logLines.map((line, i) => (
                <p
                  key={i}
                  className={
                    line.includes('✓') || line.includes('OK')
                      ? 'text-emerald-400'
                      : line.includes('→')
                        ? 'text-accent'
                        : 'text-fg-subtle'
                  }
                >
                  <span className="mr-3 text-fg-subtle/50">{lineTime(i)}</span>
                  {line}
                </p>
              ))}
              {step < steps.length && (
                <p className="animate-pulse text-fg-subtle mt-1">▌</p>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Server Setup" description="Choose an operating system and configure your server.">
      <div className="mx-auto w-full max-w-4xl pt-1">
        {isRebuild && (
          <div className="mb-6 flex items-center gap-4 rounded-panel border border-warning/60 bg-warning/10 p-4">
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-warning font-bold text-warning">i</span>
            <p className="flex-1 text-[13px] leading-relaxed text-fg-muted">
              Rebuilding <b className="text-fg">will</b> delete all existing <b className="text-fg">data</b> and install a fresh
              operating system. It's still not too late to cancel this rebuild.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="flex-none"
              onClick={() => navigate(`/servers/${instanceId}`)}
            >
              Cancel Rebuild
            </Button>
          </div>
        )}

        <section className="mt-4">
          <h2 className="text-[15px] font-semibold">Name</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-subtle">The server name allows you to easily identify the server under your account.</p>
          <div className="mt-3 flex gap-2.5">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-server"
              disabled={!!instanceId && !isRebuild}
            />
            <Button
              variant="secondary"
              onClick={() => setName(`server-${Math.floor(Math.random() * 900 + 100)}`)}
              disabled={!!instanceId && !isRebuild}
            >
              Random
            </Button>
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
