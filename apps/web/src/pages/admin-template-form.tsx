import { ArrowLeft, FloppyDisk } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, type OsCatalogEntry, type OsGroupItem } from '@/lib/api'
import { cn } from '@/lib/utils'

const inputClass =
  'mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none'

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
        checked ? 'bg-sun-500' : 'bg-surface-3',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}

function Field({
  label,
  help,
  required,
  children,
}: {
  label: string
  help?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-fg">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {help && <span className="mt-0.5 block text-[11px] leading-snug text-fg-subtle">{help}</span>}
      {children}
    </div>
  )
}

export function AdminTemplateFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [groups, setGroups] = useState<OsGroupItem[]>([])
  const [formName, setFormName] = useState('')
  const [formVersion, setFormVersion] = useState('')
  const [formVariant, setFormVariant] = useState('')
  const [formOs, setFormOs] = useState('')
  const [formRelease, setFormRelease] = useState('')
  const [formGroupId, setFormGroupId] = useState('')
  const [formArch, setFormArch] = useState('x86_64')
  const [formImageAlias, setFormImageAlias] = useState('')
  const [catalog, setCatalog] = useState<OsCatalogEntry[]>([])
  const [formCloudInit, setFormCloudInit] = useState(true)
  const [formUefi, setFormUefi] = useState(false)
  const [formEnabled, setFormEnabled] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [resTpl, resGrp] = await Promise.all([
        id ? api.adminListOsTemplates() : Promise.resolve({ ok: true as const, data: [] as never[] }),
        api.adminListOsGroups(),
      ])
      if (!active) return
      if (resGrp.ok) setGroups(resGrp.data || [])
      const resCat = await api.adminListOsCatalog()
      if (active && resCat.ok) setCatalog(resCat.data || [])
      if (id) {
        if (resTpl.ok) {
          const found = (resTpl.data || []).find((t) => t.id === id)
          if (found) {
            setFormName(found.name)
            setFormVersion(found.version || '')
            setFormVariant(found.variant && found.variant !== 'cloud' ? found.variant : '')
            setFormOs(found.os || '')
            setFormRelease(found.release || '')
            setFormGroupId(found.groupId || '')
            setFormArch(found.arch === 'amd64' ? 'x86_64' : found.arch || 'x86_64')
            setFormImageAlias(found.imageAlias)
            setFormCloudInit(found.cloudInit !== false)
            setFormUefi(found.uefi === true)
            setFormEnabled(found.enabled !== false)
          } else {
            setError('Template not found.')
          }
        } else {
          setError(resTpl.error.message || 'Failed to load template.')
        }
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formImageAlias.trim()) return
    setSubmitting(true)
    setError(null)

    const payload = {
      name: formName.trim(),
      version: formVersion.trim() || '1.00',
      variant: formVariant.trim(),
      os: formOs.trim(),
      release: formRelease.trim(),
      groupId: formGroupId || null,
      arch: formArch === 'x86_64' ? 'amd64' : formArch,
      imageAlias: formImageAlias.trim(),
      cloudInit: formCloudInit,
      uefi: formUefi,
      enabled: formEnabled,
    }

    const res =
      isEdit && id
        ? await api.adminUpdateOsTemplate(id, payload)
        : await api.adminCreateOsTemplate(payload)

    if (res.ok) {
      navigate('/admin/templates')
    } else {
      setError(res.error.message || 'Failed to save template.')
    }
    setSubmitting(false)
  }

  const title = isEdit ? `Edit Template: ${formName || 'Template'}` : 'New OS Template'

  return (
    <AppShell title={title} description="Configure an Incus OS image template for provisioning.">
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/templates')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Templates
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">Media</span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">Templates</span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">{isEdit ? 'Edit' : 'New'}</span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Configure the Incus image alias, identity and provisioning behaviour for this template.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading template details...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            {/* Left card: identity & source */}
            <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <Field label="Name" help="Name of the template shown to the end user." required>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ubuntu Server"
                    className={inputClass}
                  />
                </Field>
                <Field label="Version" help="Version of the template shown to the end user.">
                  <input
                    type="text"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    placeholder="24.04 LTS (Noble Numbat)"
                    className={inputClass}
                  />
                </Field>
                <Field label="Variant" help="Optional variant tag, e.g. minimal or latest.">
                  <input
                    type="text"
                    value={formVariant}
                    onChange={(e) => setFormVariant(e.target.value)}
                    placeholder="minimal, latest..."
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                label="Image Alias"
                help="Cloud image alias from the Incus image remotes. Solstice-hosted images start with solstice/."
                required
              >
                <select
                  required
                  value={formImageAlias}
                  onChange={(e) => setFormImageAlias(e.target.value)}
                  className={cn(inputClass, 'font-mono')}
                >
                  <option value="">Select a cloud image...</option>
                  {catalog
                    .filter(
                      (e) =>
                        e.variant.toLowerCase().includes('cloud') ||
                        e.alias.toLowerCase().endsWith('/cloud') ||
                        e.alias.startsWith('solstice/'),
                    )
                    .map((e) => (
                      <option key={`${e.alias}|${e.arch}`} value={e.alias}>
                        {e.alias} ({e.os} {e.release} {e.arch})
                      </option>
                    ))}
                  {formImageAlias &&
                    !catalog.some((e) => e.alias === formImageAlias) && (
                      <option value={formImageAlias}>{formImageAlias} (current)</option>
                    )}
                </select>
              </Field>

              <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/admin/templates')}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting} className="gap-1.5">
                  <FloppyDisk size={16} />
                  {submitting ? 'Saving...' : isEdit ? 'Update Template' : 'Create Template'}
                </Button>
              </div>
            </div>

            {/* Right card: provisioning settings */}
            <aside className="flex flex-col rounded-panel border border-border bg-surface shadow-2xs">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-fg">Template Group</p>
                  <p className="text-[11px] text-fg-subtle">Distribution family this template belongs to.</p>
                </div>
                <select
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className="h-9 w-44 rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="">(None)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-fg">Architecture</p>
                  <p className="text-[11px] text-fg-subtle">CPU architecture of the Incus image.</p>
                </div>
                <select
                  value={formArch}
                  onChange={(e) => setFormArch(e.target.value)}
                  className="h-9 w-36 rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="x86_64">x86_64</option>
                  <option value="arm64">arm64 (aarch64)</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-fg">Enabled</p>
                  <p className="text-[11px] text-fg-subtle">Allow end users to use this template.</p>
                </div>
                <Toggle checked={formEnabled} onChange={setFormEnabled} label="Enabled" />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-fg">Cloud-Init</p>
                  <p className="text-[11px] text-fg-subtle">
                    Enable this if the template supports cloud-init configuration.
                  </p>
                </div>
                <Toggle checked={formCloudInit} onChange={setFormCloudInit} label="Cloud-Init" />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-fg">UEFI</p>
                  <p className="text-[11px] text-fg-subtle">
                    Only affects VMs, and only works on templates whose image supports UEFI boot.
                  </p>
                </div>
                <Toggle checked={formUefi} onChange={setFormUefi} label="UEFI" />
              </div>

            </aside>
          </form>
        )}
      </div>
    </AppShell>
  )
}
