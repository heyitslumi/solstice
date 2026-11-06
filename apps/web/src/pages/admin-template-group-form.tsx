import { ArrowLeft, FloppyDisk, Stack } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { OsLogoImage, OS_LOGOS } from '@/components/os-icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const inputClass =
  'mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none'

export function AdminTemplateGroupFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formLogo, setFormLogo] = useState('linux')
  const [formEnabled, setFormEnabled] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    async function load() {
      setLoading(true)
      const res = await api.adminListOsGroups()
      if (!active) return
      if (res.ok) {
        const found = (res.data || []).find((g) => g.id === id)
        if (found) {
          setFormName(found.name)
          setFormDesc(found.description || '')
          setFormLogo(found.logo || 'linux')
          setFormEnabled(found.enabled !== false)
        } else {
          setError('Template group not found.')
        }
      } else {
        setError(res.error.message || 'Failed to load template group.')
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
    if (!formName.trim()) return
    setSubmitting(true)
    setError(null)

    const payload = {
      name: formName.trim(),
      description: formDesc.trim(),
      logo: formLogo,
      enabled: formEnabled,
    }

    const res =
      isEdit && id
        ? await api.adminUpdateOsGroup(id, payload)
        : await api.adminCreateOsGroup(payload)

    if (res.ok) {
      navigate('/admin/template-groups')
    } else {
      setError(res.error.message || 'Failed to save template group.')
    }
    setSubmitting(false)
  }

  const title = isEdit ? `Edit Group: ${formName || 'Group'}` : 'New Template Group'

  return (
    <AppShell title={title} description="Configure an OS distribution family and its branding.">
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/template-groups')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Template Groups
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">Media</span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">Template Groups</span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">{isEdit ? 'Edit' : 'New'}</span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Configure the operating system distribution family and brand icon.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading template group details...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent-text">
                  <Stack size={18} weight="bold" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-fg">Group Identity</h2>
                  <p className="text-[11px] text-fg-subtle">Distribution family shown across templates.</p>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ubuntu, Debian, Alpine"
                  className={inputClass}
                />
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  Distribution family name, e.g. Ubuntu, Debian, Alpine.
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Description</label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Distribution overview and purpose..."
                  className="mt-1.5 w-full rounded-control border border-field-border bg-field p-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/admin/template-groups')}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting} className="gap-1.5">
                  <FloppyDisk size={16} />
                  {submitting ? 'Saving...' : isEdit ? 'Update Group' : 'Create Group'}
                </Button>
              </div>
            </div>

            <aside className="flex flex-col rounded-panel border border-border bg-surface shadow-2xs">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold text-fg">Branding &amp; Status</h2>
                <p className="text-[11px] text-fg-subtle">Logo shown beside templates in this group.</p>
              </div>

              <div className="px-5 py-4">
                <label className="text-[12px] font-semibold text-fg">Brand Logo</label>
                <select value={formLogo} onChange={(e) => setFormLogo(e.target.value)} className={inputClass}>
                  {Object.entries(OS_LOGOS).map(([key, def]) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-fg-subtle">Preview:</span>
                  <span className="flex size-8 items-center justify-center rounded-control border border-border bg-surface-2">
                    <OsLogoImage logoKey={formLogo} size={20} />
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-fg">Enabled</p>
                  <p className="text-[11px] text-fg-subtle">Allow templates in this group to be used.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formEnabled}
                  aria-label="Enabled"
                  onClick={() => setFormEnabled(!formEnabled)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                    formEnabled ? 'bg-sun-500' : 'bg-surface-3',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      formEnabled ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            </aside>
          </form>
        )}
      </div>
    </AppShell>
  )
}
