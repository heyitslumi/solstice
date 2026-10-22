import { ArrowLeft, FloppyDisk } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api, type OsCatalogEntry } from '@/lib/api'

const ARCHES = ['amd64', 'arm64', 'armhf', 'i386', 'riscv64', 'ppc64le', 's390x']

function prettyOs(os: string): string {
  const trimmed = os.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function AdminOsTemplateFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [customAlias, setCustomAlias] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [os, setOs] = useState('')
  const [release, setRelease] = useState('')
  const [arch, setArch] = useState('amd64')
  const [variant, setVariant] = useState('cloud')
  const [enabled, setEnabled] = useState(true)

  const [catalog, setCatalog] = useState<OsCatalogEntry[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [aliasFilter, setAliasFilter] = useState('')

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadCatalog() {
      setCatalogLoading(true)
      setCatalogError(null)
      const res = await api.adminListOsCatalog({ arch })
      if (!active) return
      if (res.ok) {
        setCatalog(res.data || [])
      } else {
        setCatalogError(res.error.message || 'Failed to load the image catalog.')
      }
      setCatalogLoading(false)
    }
    void loadCatalog()
    return () => {
      active = false
    }
  }, [arch])

  useEffect(() => {
    if (!id) return
    let active = true
    async function fetchTemplate() {
      setLoading(true)
      const res = await api.adminListOsTemplates()
      if (!active) return
      if (res.ok) {
        const found = res.data.find((t) => t.id === id)
        if (found) {
          setName(found.name)
          setAlias(found.imageAlias)
          setOs(found.os)
          setRelease(found.release)
          setArch(found.arch)
          setVariant(found.variant)
          setEnabled(found.enabled)
        } else {
          setError('Template not found.')
        }
      } else {
        setError(res.error.message || 'Failed to load template.')
      }
      setLoading(false)
    }
    void fetchTemplate()
    return () => {
      active = false
    }
  }, [id])

  const filteredCatalog = useMemo(() => {
    const q = aliasFilter.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter(
      (e) =>
        e.os.toLowerCase().includes(q) ||
        e.release.toLowerCase().includes(q) ||
        e.alias.toLowerCase().includes(q),
    )
  }, [catalog, aliasFilter])

  // If the current alias exists in the catalog, preselect it there.
  const aliasInCatalog = useMemo(
    () => catalog.some((e) => e.alias === alias),
    [catalog, alias],
  )

  useEffect(() => {
    if (!isEdit || loading) return
    setUseCustom(alias !== '' && !aliasInCatalog)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, aliasInCatalog])

  function applyCatalogEntry(entryAlias: string) {
    setAlias(entryAlias)
    if (!entryAlias) return
    const entry = catalog.find((e) => e.alias === entryAlias)
    if (!entry) return
    const pretty = prettyOs(entry.os)
    setOs(pretty)
    setRelease(entry.release)
    setArch(entry.arch)
    setVariant(entry.variant)
    setName((prev) => {
      if (prev.trim()) return prev
      return `${pretty} ${entry.release}`.trim()
    })
  }

  const effectiveAlias = useCustom ? customAlias.trim() : alias

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !effectiveAlias) return
    setSaving(true)
    setError(null)

    const payload = {
      name: name.trim(),
      imageAlias: effectiveAlias,
      os: os.trim(),
      release: release.trim(),
      arch,
      variant: variant.trim() || 'cloud',
      enabled,
    }

    const res =
      isEdit && id
        ? await api.adminUpdateOsTemplate(id, payload)
        : await api.adminCreateOsTemplate(payload)

    if (res.ok) {
      navigate('/admin/os-templates')
    } else {
      setError(res.error.message || 'Failed to save template.')
    }
    setSaving(false)
  }

  return (
    <AppShell
      title={isEdit ? 'Edit OS Template' : 'New OS Template'}
      description="Map a friendly name to a LinuxContainers image alias."
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/os-templates')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Templates
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
              Operating Systems
            </span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">
              {isEdit ? 'Edit Template' : 'New Template'}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">
            {isEdit ? `Edit Template: ${name || 'OS'}` : 'Add OS Template'}
          </h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Pick an image from images.linuxcontainers.org — it becomes available at VPS creation.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading template...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs"
          >
            {/* Image source */}
            <div>
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-fg">Image Source</h2>
                  <p className="text-[11px] text-fg-subtle">
                    Live index from images.linuxcontainers.org.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="text-[12px] font-semibold text-fg">Architecture</label>
                  <select
                    value={arch}
                    onChange={(e) => setArch(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  >
                    {ARCHES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Filter Images</label>
                  <input
                    type="text"
                    value={aliasFilter}
                    onChange={(e) => setAliasFilter(e.target.value)}
                    placeholder="e.g. ubuntu, debian, 24.04..."
                    disabled={useCustom}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[12px] font-semibold text-fg">
                    Image <span className="text-danger">*</span>
                  </label>
                  {catalogError ? (
                    <Alert tone="danger">{catalogError}</Alert>
                  ) : catalogLoading ? (
                    <div className="mt-1.5 rounded-control border border-border bg-surface-2/40 p-4 text-[13px] text-fg-subtle">
                      Loading image catalog...
                    </div>
                  ) : (
                    <select
                      value={useCustom ? '' : alias}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setUseCustom(true)
                        } else {
                          setUseCustom(false)
                          applyCatalogEntry(e.target.value)
                        }
                      }}
                      required={!useCustom}
                      className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                    >
                      <option value="">Select an image...</option>
                      {filteredCatalog.map((entry) => (
                        <option key={`${entry.alias}|${entry.arch}`} value={entry.alias}>
                          {prettyOs(entry.os)} {entry.release} — {entry.alias} ({entry.variant})
                        </option>
                      ))}
                      <option value="__custom__">Custom alias...</option>
                    </select>
                  )}
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {filteredCatalog.length} images for {arch}.
                  </span>
                </div>

                {useCustom && (
                  <div className="md:col-span-2">
                    <label className="text-[12px] font-semibold text-fg">
                      Custom Alias <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customAlias}
                      onChange={(e) => setCustomAlias(e.target.value)}
                      placeholder="ubuntu/noble/cloud"
                      className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Template details */}
            <div className="border-t border-border pt-6">
              <h2 className="text-[15px] font-semibold text-fg">Template Details</h2>

              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="text-[12px] font-semibold text-fg">
                    Display Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ubuntu 24.04 LTS"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Shown to users when creating a VPS.
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">OS</label>
                  <input
                    type="text"
                    value={os}
                    onChange={(e) => setOs(e.target.value)}
                    placeholder="Ubuntu"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Release</label>
                  <input
                    type="text"
                    value={release}
                    onChange={(e) => setRelease(e.target.value)}
                    placeholder="noble"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Variant</label>
                  <input
                    type="text"
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    placeholder="cloud"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <label className="mt-4 flex items-center gap-2 cursor-pointer select-none text-[13px] text-fg">
                <Checkbox
                  checked={enabled}
                  onCheckedChange={(checked) => setEnabled(checked === true)}
                />
                Available for VPS creation
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/admin/os-templates')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : isEdit ? 'Update Template' : 'Create Template'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}
