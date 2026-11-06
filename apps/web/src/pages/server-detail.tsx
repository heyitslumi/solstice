import {
  ArrowClockwise,
  ArrowLeft,
  Camera,
  Copy,
  Globe,
  Key,
  ShieldCheck,
  SquaresFour,
  Cpu,
  Database,
  HardDrives,
  PencilSimple,
  Play,
  Snowflake,
  Plus,
  Prohibit,
  Square,
  Terminal,
  Trash,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AnimatedNumber, StatusDot } from '@/components/ui/live'
import { PowerConfirmDialog, type ConfirmablePowerAction } from '@/components/power-confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { api, type ApiInstanceDetail, type InstanceSnapshot, type PortForward } from '@/lib/api'

interface FirewallRule {
  direction: 'ingress' | 'egress'
  index: number
  action: string
  protocol: string
  ports: string
  remote: string
  state: string
}
import { ServerSetupPage } from '@/pages/server-setup'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs)) return 'recently'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function UsageCard({
  icon,
  label,
  percent,
  footerLeft,
  footerRight,
  barClass,
  active,
}: {
  icon: React.ReactNode
  label: string
  percent: number | null
  footerLeft: string
  footerRight: string
  barClass: string
  active: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-control bg-surface-2 text-fg-muted">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium text-fg-subtle">{label}</span>
          <span className="font-mono text-[22px] font-bold leading-none tracking-tight text-fg">
            {active && percent !== null ? (
              <AnimatedNumber value={percent} format={(n) => `${Math.round(n)}%`} />
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barClass)}
          style={{ width: `${active && percent !== null ? percent : 0}%` }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[11px] text-fg-subtle">
        <span>{footerLeft}</span>
        <span>{footerRight}</span>
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <dt className="shrink-0 text-[12px] text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-all text-right text-[13px] text-fg">{children}</dd>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'running') return 'Running'
  if (status === 'frozen') return 'Suspended'
  return 'Stopped'
}

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useSession()
  const isAdmin = user?.isAdmin === true

  const [instance, setInstance] = useState<ApiInstanceDetail | null>(null)
  const [snapshots, setSnapshots] = useState<InstanceSnapshot[]>([])
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; imageAlias: string; arch: string }>>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmablePowerAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const [snapName, setSnapName] = useState('')
  const [snapWorking, setSnapWorking] = useState<string | null>(null)
  const [schedEnabled, setSchedEnabled] = useState(false)
  const [schedValue, setSchedValue] = useState('')
  const [schedExpiry, setSchedExpiry] = useState('7')
  const [schedWorking, setSchedWorking] = useState(false)

  const [portForwards, setPortForwards] = useState<PortForward[]>([])
  const [forwardQuota, setForwardQuota] = useState({ used: 0, limit: 5 })
  const [pfPort, setPfPort] = useState('')
  const [pfProtocol, setPfProtocol] = useState('tcp')
  const [pfDescription, setPfDescription] = useState('')
  const [pfWorking, setPfWorking] = useState(false)
  const [pfRemovingId, setPfRemovingId] = useState<string | null>(null)

  type DetailTab = 'overview' | 'snapshots' | 'network' | 'firewall'
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const detailTabs: Array<{ id: DetailTab; label: string; icon: ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <SquaresFour size={15} aria-hidden /> },
    { id: 'snapshots', label: 'Snapshots', icon: <Camera size={15} aria-hidden /> },
    { id: 'network', label: 'Network', icon: <Globe size={15} aria-hidden /> },
    { id: 'firewall', label: 'Firewall', icon: <ShieldCheck size={15} aria-hidden /> },
  ]

  const [fwEnabled, setFwEnabled] = useState(false)
  const [fwRules, setFwRules] = useState<FirewallRule[]>([])
  const [fwWorking, setFwWorking] = useState(false)
  const [fwDir, setFwDir] = useState('ingress')
  const [fwAction, setFwAction] = useState('allow')
  const [fwProto, setFwProto] = useState('')
  const [fwPorts, setFwPorts] = useState('')
  const [fwRemote, setFwRemote] = useState('')
  const [fwRemoving, setFwRemoving] = useState<string | null>(null)

  // Quick action dialogs
  const [sshDialogOpen, setSshDialogOpen] = useState(false)
  const [reinstallOpen, setReinstallOpen] = useState(false)
  const [reinstallTemplate, setReinstallTemplate] = useState('')
  const [reinstallConfirm, setReinstallConfirm] = useState('')
  const [reinstalling, setReinstalling] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  const loadAll = useCallback(async () => {
    if (!id) return
    const [instanceRes, snapsRes, tplRes, forwardsRes, schedRes, fwRes] = await Promise.all([
      api.getInstance(id),
      api.listSnapshots(id),
      api.listOsTemplates(),
      api.listPortForwards(),
      api.getSnapshotSchedule(id),
      api.getFirewall(id),
    ])
    if (instanceRes.ok) {
      setInstance(instanceRes.data.instance)
      setError(null)
    } else {
      setError(instanceRes.error.message || 'Instance not found')
    }
    if (snapsRes.ok) {
      setSnapshots(snapsRes.data.snapshots)
    }
    if (schedRes.ok) {
      setSchedEnabled(schedRes.data.enabled)
      setSchedValue(schedRes.data.schedule)
      setSchedExpiry(String(schedRes.data.expiryDays))
    }
    if (fwRes.ok) {
      setFwEnabled(fwRes.data.enabled)
      setFwRules(fwRes.data.rules || [])
    }
    if (forwardsRes.ok) {
      setPortForwards((forwardsRes.data.forwards || []).filter((f) => f.instanceId === id))
      if (forwardsRes.data.quota) setForwardQuota(forwardsRes.data.quota)
    }
    const fwdRes = await api.getSshForward(id)
    if (fwdRes.ok) setSshForward(fwdRes.data.forward)
    if (tplRes.ok) {
      setTemplates(tplRes.data.templates || [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadAll()
    const timer = setInterval(loadAll, 10000)
    return () => clearInterval(timer)
  }, [loadAll])

  function flashNotice(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 4000)
  }

  async function handlePowerAction(
    action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze',
    force = false,
  ) {
    if (!id) return
    setActionLoading(true)
    try {
      const res = await api.instanceAction(id, action, force)
      if (res.ok) {
        await loadAll()
      } else {
        setError(res.error.message || `Failed to ${action}.`)
      }
    } finally {
      setActionLoading(false)
    }
  }

  const [sshSessionUrl, setSshSessionUrl] = useState<string | null>(null)
  const [sshSessionStarting, setSshSessionStarting] = useState(false)

  const [sshForward, setSshForward] = useState<{
    host: string
    hostPort: number
    username: string
  } | null>(null)
  const [sshForwardWorking, setSshForwardWorking] = useState(false)
  // One-time password lives apart from the polled forward state so the
  // 10s refresh can never wipe it mid-read. Cleared only when dismissed.
  const [sshPasswordModal, setSshPasswordModal] = useState<string | null>(null)
  const [pwWorking, setPwWorking] = useState(false)

  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)

  async function handleEnableSshForward() {
    if (!id) return
    setSshForwardWorking(true)
    setError(null)
    const res = await api.enableSshForward(id)
    if (res.ok) {
      setSshForward({
        host: res.data.host,
        hostPort: res.data.hostPort,
        username: res.data.username,
      })
      setSshPasswordModal(res.data.password)
      flashNotice(`Direct SSH enabled on port ${res.data.hostPort}.`)
    } else {
      setError(res.error.message || 'Failed to enable direct SSH.')
    }
    setSshForwardWorking(false)
  }

  async function handleDisableSshForward() {
    if (!id) return
    setSshForwardWorking(true)
    const res = await api.disableSshForward(id)
    if (res.ok) {
      setSshForward(null)
      flashNotice('Direct SSH disabled and the port was freed.')
    } else {
      setError(res.error.message || 'Failed to disable direct SSH.')
    }
    setSshForwardWorking(false)
  }

  async function handleResetPassword() {
    if (!id) return
    setPwWorking(true)
    setError(null)
    const res = await api.generateSshPassword(id)
    if (res.ok) {
      setSshPasswordModal(res.data.password)
      flashNotice('New root password issued — shown once.')
    } else {
      setError(res.error.message || 'Failed to reset the password.')
    }
    setPwWorking(false)
  }

  async function handleClone(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !cloneName.trim()) return
    setCloning(true)
    setError(null)
    const res = await api.cloneInstance(id, cloneName.trim().toLowerCase())
    if (res.ok) {
      setCloneOpen(false)
      navigate(`/servers/${res.data.id}`)
    } else {
      setError(res.error.message || 'Failed to clone the server.')
    }
    setCloning(false)
  }

  async function handleStartSshSession() {
    if (!id) return
    setSshSessionStarting(true)
    setError(null)
    const res = await api.startSshSession(id)
    if (res.ok) {
      setSshSessionUrl(res.data.url)
    } else {
      setError(res.error.message || 'Failed to start a terminal session.')
    }
    setSshSessionStarting(false)
  }

  async function handleStopSshSession() {
    if (!id) return
    setSshSessionStarting(true)
    await api.stopSshSession(id).catch(() => null)
    setSshSessionUrl(null)
    setSshSessionStarting(false)
  }

  async function handleReinstall(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !instance || reinstallConfirm.trim().toLowerCase() !== instance.name.toLowerCase()) {
      return
    }
    setReinstalling(true)
    setError(null)
    const res = await api.reinstallInstance(id, reinstallTemplate || undefined)
    if (res.ok) {
      flashNotice(`Reinstalled with ${res.data.os}. Previous data was destroyed.`)
      setReinstallOpen(false)
      setReinstallConfirm('')
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to reinstall.')
    }
    setReinstalling(false)
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setRenaming(true)
    setError(null)
    const res = await api.renameInstance(id, renameValue.trim().toLowerCase())
    if (res.ok) {
      flashNotice(`Renamed to "${res.data.name}".`)
      setRenameOpen(false)
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to rename.')
    }
    setRenaming(false)
  }

  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !snapName.trim()) return
    setSnapWorking('__new__')
    const res = await api.createSnapshot(id, snapName.trim())
    if (res.ok) {
      flashNotice(`Snapshot "${snapName.trim()}" created.`)
      setSnapName('')
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to create snapshot.')
    }
    setSnapWorking(null)
  }

  async function handleRestoreSnapshot(snap: string) {
    if (!id) return
    setSnapWorking(snap)
    const res = await api.restoreSnapshot(id, snap)
    if (res.ok) {
      flashNotice(`Restored snapshot "${snap}".`)
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to restore snapshot.')
    }
    setSnapWorking(null)
  }

  async function handleDeleteSnapshot(snap: string) {
    if (!id) return
    setSnapWorking(snap)
    const res = await api.deleteSnapshot(id, snap)
    if (res.ok) {
      flashNotice(`Snapshot "${snap}" deleted.`)
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to delete snapshot.')
    }
    setSnapWorking(null)
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSchedWorking(true)
    setError(null)
    const res = await api.setSnapshotSchedule(id, {
      schedule: schedValue.trim(),
      expiryDays: Math.max(1, Math.floor(Number(schedExpiry) || 7)),
    })
    if (res.ok) {
      setSchedEnabled(res.data.enabled)
      setSchedValue(res.data.schedule)
      setSchedExpiry(String(res.data.expiryDays))
      flashNotice(
        res.data.enabled
          ? `Automatic snapshots enabled (${res.data.schedule}, kept ${res.data.expiryDays}d).`
          : 'Automatic snapshots disabled.',
      )
    } else {
      setError(res.error.message || 'Failed to save snapshot schedule.')
    }
    setSchedWorking(false)
  }

  async function handleAddPortForward(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !pfPort) return
    setPfWorking(true)
    setError(null)
    const res = await api.createPortForward(id, {
      containerPort: Number(pfPort),
      protocol: pfProtocol,
      description: pfDescription.trim(),
    })
    if (res.ok) {
      flashNotice(`Forward created: port ${res.data.hostPort} → ${res.data.containerPort}/${res.data.protocol}.`)
      setPfPort('')
      setPfDescription('')
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to create port forward.')
    }
    setPfWorking(false)
  }

  async function handleRemovePortForward(fwdId: string) {
    if (!id) return
    setPfRemovingId(fwdId)
    setError(null)
    const res = await api.deletePortForward(id, fwdId)
    if (res.ok) {
      flashNotice('Port forward removed.')
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to remove port forward.')
    }
    setPfRemovingId(null)
  }

  async function handleFirewallToggle(enabled: boolean) {
    if (!id) return
    setFwWorking(true)
    setError(null)
    const res = await api.toggleFirewall(id, enabled)
    if (res.ok) {
      setFwEnabled(res.data.enabled)
      setFwRules(res.data.rules || [])
      flashNotice(enabled ? 'Firewall enabled with safe defaults.' : 'Firewall disabled.')
    } else {
      setError(res.error.message || 'Failed to update firewall.')
    }
    setFwWorking(false)
  }

  async function handleAddFirewallRule(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setFwWorking(true)
    setError(null)
    const res = await api.addFirewallRule(id, {
      direction: fwDir,
      action: fwAction,
      protocol: fwProto,
      ports: fwPorts.trim(),
      remote: fwRemote.trim(),
    })
    if (res.ok) {
      setFwEnabled(res.data.enabled)
      setFwRules(res.data.rules || [])
      setFwPorts('')
      setFwRemote('')
      flashNotice('Firewall rule added.')
    } else {
      setError(res.error.message || 'Failed to add firewall rule.')
    }
    setFwWorking(false)
  }

  async function handleDeleteFirewallRule(direction: string, index: number) {
    if (!id) return
    setFwRemoving(`${direction}:${index}`)
    setError(null)
    const res = await api.deleteFirewallRule(id, { direction, index })
    if (res.ok) {
      setFwEnabled(res.data.enabled)
      setFwRules(res.data.rules || [])
      flashNotice('Firewall rule removed.')
    } else {
      setError(res.error.message || 'Failed to remove firewall rule.')
    }
    setFwRemoving(null)
  }

  function copyToClipboard(text: string, field: string) {
    if (!text || text === '—') return
    void navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (loading) {
    return (
      <AppShell title="Loading Instance..." description="Connecting to Incus engine...">
        <div className="flex h-64 items-center justify-center">
          <ArrowClockwise size={24} className="animate-spin text-fg-subtle" />
        </div>
      </AppShell>
    )
  }

  if (error && !instance) {
    return (
      <AppShell title="Server Not Found" description="The requested instance could not be found.">
        <div className="flex flex-col items-start gap-4">
          <Alert tone="danger">{error}</Alert>
          <Button asChild variant="secondary">
            <Link to="/servers">
              <ArrowLeft size={16} />
              Back to Servers
            </Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  if (!instance) return null

  // Bare server (no OS installed yet) — owner picks the OS on first access.
  if (!instance.os) {
    return <ServerSetupPage instanceId={instance.id} instanceName={instance.name} />
  }

  const isRunning = instance.status === 'running'
  const isFrozen = instance.status === 'frozen'
  const ramUsedMb = Math.round((instance.ramUsage / 100) * instance.memoryMb)
  const diskUsedGb = instance.diskUsage !== null && instance.diskUsage !== undefined
    ? +((instance.diskUsage / 100) * instance.diskGb).toFixed(1)
    : null

  const quickActions = [
    {
      id: 'ssh',
      icon: <Terminal size={20} aria-hidden />,
      tint: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      title: 'SSH Session',
      desc: 'Terminal in your browser',
      onClick: () => {
        setSshDialogOpen(true)
      },
    },
    {
      id: 'password',
      icon: <Key size={20} aria-hidden />,
      tint: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      title: 'Reset Password',
      desc: 'New one-time root password',
      onClick: () => void handleResetPassword(),
    },
    ...(isAdmin
      ? [
          {
            id: 'clone',
            icon: <Copy size={20} aria-hidden />,
            tint: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
            title: 'Clone Server',
            desc: 'Duplicate this VPS',
            onClick: () => {
              setCloneName(`${instance.name}-clone`.slice(0, 32))
              setCloneOpen(true)
            },
          },
        ]
      : []),
    {
      id: 'reinstall',
      icon: <ArrowClockwise size={20} aria-hidden />,
      tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      title: 'Reinstall OS',
      desc: 'Fresh installation',
      onClick: () => {
        setReinstallTemplate('')
        setReinstallConfirm('')
        setReinstallOpen(true)
      },
    },
    {
      id: 'rename',
      icon: <PencilSimple size={20} aria-hidden />,
      tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      title: 'Rename VPS',
      desc: 'Change hostname',
      onClick: () => {
        setRenameValue(instance.name)
        setRenameOpen(true)
      },
    },
  ]

  return (
    <AppShell
      title={instance.name}
      description={`${instance.os} · ${instance.region}`}
    >
      <div className="flex w-full flex-col gap-5">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent-text">
              {instance.type === 'kvm' ? (
                <HardDrives size={24} aria-hidden />
              ) : (
                <Terminal size={24} aria-hidden />
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-mono text-[20px] font-bold tracking-tight text-fg">
                  {instance.name}
                </h1>
                <span
                  className={cn(
                    'rounded-control border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
                    instance.type === 'kvm'
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {instance.type}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot status={instance.status} />
                  {statusLabel(instance.status)}
                </span>
                <span>Created {relativeTime(instance.createdAt)}</span>
                {instance.nodeName && (
                  <span className="font-mono text-[11px]">on {instance.nodeName}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {isRunning ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={actionLoading}
                  onClick={(e) =>
                    e.shiftKey ? void handlePowerAction('restart') : setConfirmAction('restart')
                  }
                >
                  <ArrowClockwise size={15} className={actionLoading ? 'animate-spin' : ''} />
                  Restart
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={actionLoading}
                  onClick={(e) =>
                    e.shiftKey ? void handlePowerAction('stop') : setConfirmAction('stop')
                  }
                >
                  <Square size={14} weight="fill" />
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={actionLoading}
                  onClick={(e) =>
                    e.shiftKey ? void handlePowerAction('freeze') : setConfirmAction('freeze')
                  }
                  className="text-sky-600 dark:text-sky-400"
                >
                  <Snowflake size={15} aria-hidden />
                  Freeze
                </Button>
              </>
            ) : isFrozen && instance.suspendReason ? (
              isAdmin ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={actionLoading}
                  onClick={() => void handlePowerAction('unfreeze')}
                >
                  <Play size={14} weight="fill" />
                  Unsuspend
                </Button>
              ) : null
            ) : isFrozen ? (
              <Button
                size="sm"
                variant="primary"
                disabled={actionLoading}
                onClick={() => void handlePowerAction('unfreeze')}
              >
                <Play size={14} weight="fill" />
                Unfreeze
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={actionLoading}
                onClick={() => void handlePowerAction('start')}
              >
                <Play size={14} weight="fill" />
                Start
              </Button>
            )}
          </div>
        </div>

        {instance.suspendReason && (
          <div className="flex flex-col items-center gap-2 rounded-panel border border-amber-500/30 bg-surface px-6 py-8 text-center shadow-2xs">
            <span className="flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
              <Prohibit size={28} weight="bold" aria-hidden />
            </span>
            <h2 className="text-[18px] font-bold text-fg">VPS Suspended</h2>
            <p className="text-[13px] text-fg-subtle">
              This virtual private server has been suspended.
            </p>
            <p className="w-full max-w-md rounded-control border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-left text-[13px] text-amber-600 dark:text-amber-400">
              <strong className="font-semibold">Reason:</strong> {instance.suspendReason}
            </p>
            {!isAdmin && (
              <p className="text-[12px] text-fg-subtle">
                Contact an administrator if you believe this is a mistake.
              </p>
            )}
          </div>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {/* Usage cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UsageCard
            icon={<Cpu size={18} aria-hidden />}
            label="CPU Usage"
            percent={isRunning ? instance.cpuUsage : null}
            footerLeft={`${instance.cores} Core${instance.cores === 1 ? '' : 's'}`}
            footerRight={
              isRunning && instance.cpuUsage !== null ? `${instance.cpuUsage}% Used` : statusLabel(instance.status)
            }
            barClass="bg-accent"
            active={isRunning}
          />
          <UsageCard
            icon={<Database size={18} aria-hidden />}
            label="RAM Usage"
            percent={isRunning ? instance.ramUsage : null}
            footerLeft={instance.memory}
            footerRight={
              isRunning ? `${ramUsedMb}MB / ${instance.memoryMb}MB` : statusLabel(instance.status)
            }
            barClass="bg-emerald-400"
            active={isRunning}
          />
          <UsageCard
            icon={<HardDrives size={18} aria-hidden />}
            label="Disk Usage"
            percent={isRunning ? (instance.diskUsage ?? null) : null}
            footerLeft={`${instance.diskGb}GB`}
            footerRight={
              isRunning && diskUsedGb !== null ? `${instance.diskUsage}% Used` : statusLabel(instance.status)
            }
            barClass="bg-sky-500"
            active={isRunning}
          />
        </div>

        {isAdmin && instance.owner && instance.owner.id !== user?.id && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-amber-500/30 bg-amber-500/10 px-5 py-3.5">
            <p className="text-[13px] text-amber-600 dark:text-amber-400">
              You&apos;re viewing <strong className="font-semibold">{instance.owner.name}</strong>
              &apos;s server ({instance.owner.email}) — actions run on their VPS and are logged
              to the activity feed.
            </p>
            <Button variant="secondary" size="sm" asChild className="gap-1.5 text-[12px]">
              <Link to={`/admin/servers/${instance.id}`}>
                <ArrowLeft size={14} />
                Back to admin view
              </Link>
            </Button>
          </div>
        )}

        {/* Quick actions */}
        <section className="rounded-panel border border-border bg-surface p-5">
          <h2 className="text-[14px] font-semibold text-fg">Quick Actions</h2>
          <div
            className={cn(
              'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2',
              isAdmin ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
            )}
          >
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={actionLoading || pwWorking}
                className="group flex items-center gap-3 rounded-panel border border-border bg-surface-2/30 p-4 text-left transition-colors hover:border-accent disabled:opacity-60"
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-control', action.tint)}>
                  {action.icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold text-fg">{action.title}</span>
                  <span className="truncate text-[11px] text-fg-subtle">{action.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>


        {/* Server tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-panel border border-border bg-surface p-1.5">
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-surface-2 text-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="flex flex-col gap-5">
          {/* System information */}
          <section className="rounded-panel border border-border bg-surface p-5">
            <h2 className="text-[14px] font-semibold text-fg">System Information</h2>
            <dl className="mt-2">
              <InfoRow label="Hostname">
                <span className="font-mono text-[12px]">{instance.name}</span>
              </InfoRow>
              <InfoRow label="Virtualization">
                <span className="font-mono text-[12px] uppercase">{instance.type}</span>
              </InfoRow>
              <InfoRow label="Operating System">
                <span className="font-mono text-[12px]">
                  {instance.os} <span className="text-fg-subtle">({instance.imageAlias})</span>
                </span>
              </InfoRow>
              <InfoRow label="Status">
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot status={instance.status} />
                  {statusLabel(instance.status)}
                </span>
              </InfoRow>
              <InfoRow label="Node">
                {instance.nodeName ?? 'Unassigned'}
                {instance.nodeName && (
                  <span className="ml-2 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                    {instance.region}
                  </span>
                )}
              </InfoRow>
              <InfoRow label="Private IPv4">
                <button
                  type="button"
                  onClick={() => copyToClipboard(instance.ip4, 'ip4')}
                  className={cn(
                    'inline-flex items-center gap-1.5 font-mono text-[12px]',
                    instance.ip4 === '—' ? 'text-fg-subtle' : 'text-fg hover:text-accent',
                  )}
                >
                  {instance.ip4}
                  {instance.ip4 !== '—' && <Copy size={13} aria-hidden />}
                </button>
              </InfoRow>
              <InfoRow label="Private IPv6">
                <span className="font-mono text-[12px]">{instance.ip6}</span>
              </InfoRow>
              <InfoRow label="Created">{relativeTime(instance.createdAt)}</InfoRow>
              <InfoRow label="Bandwidth">{instance.bandwidth} total</InfoRow>
            </dl>
          </section>

        {/* Network interfaces */}
        <section className="rounded-panel border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[14px] font-semibold text-fg">Network Interfaces</h2>
          </div>
          {instance.networkInterfaces && instance.networkInterfaces.length > 0 ? (
            <div className="divide-y divide-border">
              {instance.networkInterfaces.map((iface) => (
                <div
                  key={iface.interface}
                  className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-fg">
                        {iface.interface}
                      </span>
                      <span className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-fg-subtle">
                        {iface.state}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-fg-subtle">MAC: {iface.hwaddr}</p>
                  </div>

                  <div className="flex flex-col gap-1 font-mono text-xs text-fg-muted sm:text-right">
                    <div className="flex items-center gap-2 sm:justify-end">
                      <span className="text-fg">{iface.ip4}</span>
                      {iface.ip4 !== '—' && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(iface.ip4, `ip4-${iface.interface}`)}
                          className="text-fg-subtle hover:text-fg"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-subtle">
                      RX: {iface.rxFormatted} · TX: {iface.txFormatted}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-fg-subtle">
              No active network interfaces reported.
            </div>
          )}
        </section>
          </div>
        )}

        {activeTab === 'snapshots' && (
          <section className="rounded-panel border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-fg">Snapshots</h2>
              <span className="font-mono text-[11px] text-fg-subtle">
                {snapshots.length} stored
              </span>
            </div>

            <form onSubmit={handleCreateSnapshot} className="mt-3 flex gap-2">
              <input
                type="text"
                value={snapName}
                onChange={(e) => setSnapName(e.target.value)}
                placeholder="e.g. before-upgrade"
                className="h-9 flex-1 rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={snapWorking === '__new__' || !snapName.trim()}
                className="gap-1.5 text-[12px]"
              >
                <Plus size={14} />
                {snapWorking === '__new__' ? 'Saving...' : 'Take snapshot'}
              </Button>
            </form>

            <div className="mt-3 flex flex-col divide-y divide-border/70 rounded-control border border-border">
              {snapshots.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <Camera size={22} className="text-fg-subtle" aria-hidden />
                  <p className="text-[13px] font-medium text-fg">No snapshots yet</p>
                  <p className="max-w-xs text-[12px] text-fg-subtle">
                    Snapshots freeze the disk state so you can roll back after risky changes.
                  </p>
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.name}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] font-semibold text-fg">
                        {snap.name}
                      </p>
                      <p className="text-[11px] text-fg-subtle">
                        {new Date(snap.createdAt).toLocaleString()}
                        {snap.stateful ? ' · stateful' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={snapWorking === snap.name}
                        onClick={() => void handleRestoreSnapshot(snap.name)}
                        className="h-7 px-2 text-[11px]"
                      >
                        {snapWorking === snap.name ? 'Working...' : 'Restore'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={snapWorking === snap.name}
                        onClick={() => void handleDeleteSnapshot(snap.name)}
                        className="h-7 px-2 text-[11px]"
                        aria-label={`Delete snapshot ${snap.name}`}
                      >
                        <Trash size={13} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleSaveSchedule}
              className="mt-4 rounded-control border border-border bg-surface-2/30 p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-fg">Automatic snapshots</p>
                {schedEnabled && (
                  <span className="rounded-control border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-600 dark:text-emerald-400">
                    {schedValue} · keep {schedExpiry}d
                  </span>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_110px_auto]">
                <input
                  type="text"
                  value={schedValue}
                  onChange={(e) => setSchedValue(e.target.value)}
                  placeholder="e.g. 0 3 * * * or @daily"
                  aria-label="Snapshot schedule"
                  className="h-9 rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={schedExpiry}
                    onChange={(e) => setSchedExpiry(e.target.value)}
                    aria-label="Retention days"
                    className="h-9 w-full rounded-control border border-field-border bg-field px-2.5 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                  />
                  <span className="shrink-0 text-[11px] text-fg-subtle">days</span>
                </div>
                <div className="col-span-2 flex justify-end gap-1.5 sm:col-span-1">
                  {schedEnabled && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={schedWorking}
                      onClick={() => {
                        setSchedValue('')
                        void api
                          .setSnapshotSchedule(id ?? '', { schedule: '', expiryDays: 7 })
                          .then((res) => {
                            if (res.ok) {
                              setSchedEnabled(false)
                              setSchedValue('')
                              flashNotice('Automatic snapshots disabled.')
                            } else {
                              setError(res.error.message || 'Failed to disable schedule.')
                            }
                          })
                      }}
                      className="h-9 px-2.5 text-[12px]"
                    >
                      Disable
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={schedWorking || !schedValue.trim()}
                    className="h-9 px-2.5 text-[12px]"
                  >
                    {schedWorking ? 'Saving...' : schedEnabled ? 'Update' : 'Enable'}
                  </Button>
                </div>
              </div>
            </form>
          </section>
        )}

        {activeTab === 'network' && (
        <section className="rounded-panel border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-fg">Port Forwarding</h2>
            <span className="font-mono text-[11px] text-fg-subtle">
              {forwardQuota.used} / {forwardQuota.limit} used
            </span>
          </div>
          <p className="mt-1 text-[12px] text-fg-subtle">
            Expose a service running inside this server to the public internet via a host
            port.
          </p>

          <form
            onSubmit={handleAddPortForward}
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">VPS Port</label>
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={pfPort}
                onChange={(e) => setPfPort(e.target.value)}
                placeholder="e.g. 80"
                className="h-9 rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">Protocol</label>
              <select
                value={pfProtocol}
                onChange={(e) => setPfProtocol(e.target.value)}
                className="h-9 rounded-control border border-field-border bg-field px-2.5 text-[12px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">TCP + UDP</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">Description</label>
              <input
                type="text"
                value={pfDescription}
                onChange={(e) => setPfDescription(e.target.value)}
                placeholder="e.g. Web Server"
                maxLength={80}
                className="h-9 rounded-control border border-field-border bg-field px-3 text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={pfWorking || forwardQuota.used >= forwardQuota.limit} className="gap-1.5 text-[12px]">
              <Plus size={14} />
              {pfWorking ? 'Adding...' : 'Add Port'}
            </Button>
          </form>

          {portForwards.length > 0 && (
            <div className="mt-4 flex flex-col divide-y divide-border/70 rounded-control border border-border">
              {portForwards.map((fwd) => (
                <div
                  key={fwd.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-mono text-[12px] font-semibold text-fg">
                      :{fwd.hostPort} &rarr; :{fwd.containerPort}
                      <span className="ml-2 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-fg-subtle">
                        {fwd.protocol}
                      </span>
                      {fwd.kind === 'ssh' && (
                        <span className="ml-1.5 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-subtle">
                          SSH
                        </span>
                      )}
                    </span>
                    {fwd.description && (
                      <span className="truncate text-[11px] text-fg-subtle">{fwd.description}</span>
                    )}
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pfRemovingId === fwd.id}
                    onClick={() => void handleRemovePortForward(fwd.id)}
                    className="h-7 px-2 text-[11px] gap-1"
                  >
                    <Trash size={13} />
                    {pfRemovingId === fwd.id ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {activeTab === 'firewall' && (
        <section className="rounded-panel border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-fg">Firewall</h2>
            <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] font-medium text-fg-subtle hover:text-fg">
              <Switch
                checked={fwEnabled}
                disabled={fwWorking}
                onCheckedChange={(v) => void handleFirewallToggle(v)}
                aria-label="Enable firewall"
              />
              {fwEnabled ? 'Enabled' : 'Disabled'}
            </label>
          </div>
          <p className="mt-1 text-[12px] text-fg-subtle">
            {fwEnabled
              ? 'Inbound traffic not matching an allow rule is dropped. Outbound defaults to allow.'
              : 'All traffic currently passes. Enable to start filtering — SSH (22) and ping stay open by default.'}
          </p>

          {fwEnabled && (
            <>
              <form
                onSubmit={handleAddFirewallRule}
                className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-[110px_110px_1fr_1fr_1fr_auto] sm:items-end"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Direction</label>
                  <select
                    value={fwDir}
                    onChange={(e) => setFwDir(e.target.value)}
                    className="h-9 rounded-control border border-field-border bg-field px-2.5 text-[12px] text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="ingress">Inbound</option>
                    <option value="egress">Outbound</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Action</label>
                  <select
                    value={fwAction}
                    onChange={(e) => setFwAction(e.target.value)}
                    className="h-9 rounded-control border border-field-border bg-field px-2.5 text-[12px] text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="allow">Allow</option>
                    <option value="drop">Drop</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Protocol</label>
                  <select
                    value={fwProto}
                    onChange={(e) => setFwProto(e.target.value)}
                    className="h-9 rounded-control border border-field-border bg-field px-2.5 text-[12px] text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="">Any</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="icmp">ICMP</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Ports</label>
                  <input
                    type="text"
                    value={fwPorts}
                    onChange={(e) => setFwPorts(e.target.value)}
                    placeholder="e.g. 80,443"
                    className="h-9 rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Remote IP/CIDR</label>
                  <input
                    type="text"
                    value={fwRemote}
                    onChange={(e) => setFwRemote(e.target.value)}
                    placeholder="Any"
                    className="h-9 rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>
                <Button type="submit" variant="primary" size="sm" disabled={fwWorking} className="gap-1.5 text-[12px]">
                  <Plus size={14} />
                  {fwWorking ? 'Adding...' : 'Add Rule'}
                </Button>
              </form>

              {fwRules.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-control border border-border">
                  <table className="w-full min-w-[520px] text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
                        <th className="px-3 py-2 font-medium">Direction</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                        <th className="px-3 py-2 font-medium">Protocol</th>
                        <th className="px-3 py-2 font-medium">Ports</th>
                        <th className="px-3 py-2 font-medium">Remote</th>
                        <th className="px-3 py-2 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {fwRules.map((rule) => (
                        <tr key={`${rule.direction}:${rule.index}`} className="hover:bg-surface-2/40">
                          <td className="px-3 py-2 text-fg">
                            {rule.direction === 'ingress' ? 'Inbound' : 'Outbound'}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'rounded-control border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                rule.action === 'allow'
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'border-danger/30 bg-danger/10 text-danger',
                              )}
                            >
                              {rule.action}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-fg-subtle">{rule.protocol || 'any'}</td>
                          <td className="px-3 py-2 font-mono text-fg">{rule.ports || 'all'}</td>
                          <td className="px-3 py-2 font-mono text-fg-subtle">{rule.remote || 'any'}</td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={fwRemoving === `${rule.direction}:${rule.index}`}
                              onClick={() => void handleDeleteFirewallRule(rule.direction, rule.index)}
                              className="h-7 px-2 text-[11px] gap-1"
                              aria-label={`Delete ${rule.direction} rule ${rule.index}`}
                            >
                              <Trash size={13} />
                              {fwRemoving === `${rule.direction}:${rule.index}` ? 'Removing...' : 'Remove'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 rounded-control border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-400">
                  No rules yet — all inbound traffic is being dropped. Add an allow rule or disable the firewall.
                </p>
              )}
            </>
          )}
        </section>
        )}
      </div>

      {confirmAction && (
        <PowerConfirmDialog
          open
          action={confirmAction}
          serverName={instance.name}
          working={actionLoading}
          onConfirm={(force) => {
            const next = confirmAction
            setConfirmAction(null)
            void handlePowerAction(next, force)
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* SSH session dialog */}
      <Dialog
        open={sshDialogOpen}
        onOpenChange={(open) => {
          setSshDialogOpen(open)
          if (!open) {
            setSshSessionUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>SSH Session</DialogTitle>
          <DialogDescription>
            Connect with any SSH client through a dedicated forwarded port, or open a
            terminal right in your browser.
          </DialogDescription>

          <div className="mt-5 border-b border-border pb-5">
            <p className="text-[12px] font-semibold text-fg">Direct SSH (port forward)</p>
            {!sshForward ? (
              <div className="mt-2 flex flex-col gap-3">
                <p className="text-[12px] text-fg-subtle">
                  Picks a random free host port and proxies it to this server's SSH port
                  over NAT. A one-time root password is issued with it.
                </p>
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={sshForwardWorking || !isRunning}
                    onClick={handleEnableSshForward}
                  >
                    {sshForwardWorking ? 'Enabling...' : 'Enable Direct SSH'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-2/50 px-3 py-2.5 font-mono text-[12px]">
                  <span className="truncate text-fg">
                    ssh -p {sshForward.hostPort} {sshForward.username}@{sshForward.host}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 text-[12px]"
                    onClick={() =>
                      copyToClipboard(
                        `ssh -p ${sshForward.hostPort} ${sshForward.username}@${sshForward.host}`,
                        'ssh-cmd',
                      )
                    }
                  >
                    <Copy size={13} />
                    {copiedField === 'ssh-cmd' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Your saved SSH keys were installed alongside it — key auth just works.
                  Forgot the password? Disable and re-enable to rotate it.
                </p>
                <div className="flex justify-end">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={sshForwardWorking}
                    onClick={handleDisableSshForward}
                  >
                    {sshForwardWorking ? 'Disabling...' : 'Disable & Free Port'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5">
            <p className="text-[12px] font-semibold text-fg">Browser terminal</p>
            <p className="mt-0.5 text-[12px] text-fg-subtle">
              Open a terminal directly in your browser — no SSH client or open ports needed.
            </p>

          {!sshSessionUrl ? (
            <div className="mt-5 flex flex-col gap-3">
              <p className="text-[12px] text-fg-subtle">
                Starts a secure shared terminal (via sshx) inside the server. Anyone with the
                link gets a root shell — it stays live until you close it or stop the server.
              </p>
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={() => setSshDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="secondary" disabled={!isRunning} asChild>
                  <Link to={`/servers/${id}/console`}>Open Console</Link>
                </Button>
                <Button
                  variant="primary"
                  disabled={sshSessionStarting || !isRunning}
                  onClick={handleStartSshSession}
                >
                  {sshSessionStarting ? 'Starting...' : 'Share via sshx'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div className="rounded-control border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-600 dark:text-amber-400">
                This link opens a root shell. Share it carefully — it stays live until closed.
              </div>
              <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-2/50 px-3 py-2.5 font-mono text-[12px]">
                <span className="truncate text-fg">{sshSessionUrl}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-[12px]"
                  onClick={() => copyToClipboard(sshSessionUrl, 'ssh-url')}
                >
                  <Copy size={13} />
                  {copiedField === 'ssh-url' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <Button variant="danger" size="sm" disabled={sshSessionStarting} onClick={handleStopSshSession}>
                  {sshSessionStarting ? 'Closing...' : 'Close Session'}
                </Button>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button variant="secondary" size="sm" onClick={() => setSshDialogOpen(false)}>
                    Done
                  </Button>
                  <a href={sshSessionUrl} target="_blank" rel="noreferrer">
                    <Button variant="primary" size="sm">Open</Button>
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setSshDialogOpen(false)}>
              Close
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time password modal (separate so polling never wipes it) */}
      <Dialog open={sshPasswordModal !== null} onOpenChange={(open) => !open && setSshPasswordModal(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Root Password</DialogTitle>
          <DialogDescription>
            One-time password for this server. It is shown once and never stored — save
            it now.
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-control border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-600 dark:text-amber-400">
              Anyone with this password has full root access.
            </div>
            <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-2/50 px-3 py-2.5 font-mono text-[13px]">
              <span className="select-all text-fg">{sshPasswordModal}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1.5 text-[12px]"
                onClick={() => sshPasswordModal && copyToClipboard(sshPasswordModal, 'ssh-once')}
              >
                <Copy size={13} />
                {copiedField === 'ssh-once' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setSshPasswordModal(null)}>
                I Saved It
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reinstall dialog */}
      <Dialog open={reinstallOpen} onOpenChange={setReinstallOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Reinstall OS</DialogTitle>
          <DialogDescription>
            Destroy everything on <strong className="text-fg">{instance.name}</strong> and install
            a fresh system. All data will be lost.
          </DialogDescription>

          <form onSubmit={handleReinstall} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">Operating System</label>
              <select
                value={reinstallTemplate}
                onChange={(e) => setReinstallTemplate(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="">Keep current ({instance.os})</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.arch})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[12px] font-semibold text-fg">
                Type <span className="font-mono text-fg">{instance.name}</span> to confirm
              </label>
              <input
                type="text"
                value={reinstallConfirm}
                onChange={(e) => setReinstallConfirm(e.target.value)}
                placeholder={instance.name}
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setReinstallOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={
                  reinstalling ||
                  reinstallConfirm.trim().toLowerCase() !== instance.name.toLowerCase()
                }
              >
                {reinstalling ? 'Reinstalling...' : 'Wipe & Reinstall'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clone dialog */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Clone Server</DialogTitle>
          <DialogDescription>
            Copies this server&apos;s disk into a brand-new VPS with the same plan
            (CPU, RAM, disk). Works while running — the copy is taken from a
            temporary snapshot. Port forwards are never copied.
          </DialogDescription>

          <form onSubmit={handleClone} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">Clone hostname</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value.toLowerCase())}
                pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
                required
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-fg-subtle">
                3-32 chars, lowercase letters, numbers, hyphens. Copying a large disk
                can take a few minutes.
              </span>
            </div>

            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setCloneOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={cloning}>
                {cloning ? 'Cloning...' : 'Clone'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Rename VPS</DialogTitle>
          <DialogDescription>
            {isRunning || isFrozen
              ? 'Stop the server before renaming it.'
              : 'The hostname updates in Incus and the panel together.'}
          </DialogDescription>

          <form onSubmit={handleRename} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">New hostname</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value.toLowerCase())}
                pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
                required
                disabled={isRunning || isFrozen}
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-60"
              />
              <span className="mt-1 block text-[11px] text-fg-subtle">
                3-32 chars, lowercase letters, numbers, hyphens.
              </span>
            </div>

            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={renaming || isRunning || isFrozen}
              >
                {renaming ? 'Renaming...' : 'Rename'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
