import {
  ArrowLeft,
  FloppyDisk,
  MapPin,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function AdminLocationFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [shortCode, setShortCode] = useState('')
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [city, setCity] = useState('')
  const [description, setDescription] = useState('')

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true

    async function fetchLocation() {
      setLoading(true)
      const res = await api.adminListLocations()
      if (!active) return

      if (res.ok) {
        const found = res.data.locations.find((l) => l.id === id)
        if (found) {
          setShortCode(found.shortCode)
          setName(found.name)
          setCountryCode(found.countryCode || '')
          setCity(found.city || '')
          setDescription(found.description || '')
        } else {
          setError('Location not found.')
        }
      } else {
        setError(res.error.message || 'Failed to fetch location.')
      }
      setLoading(false)
    }

    void fetchLocation()
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!shortCode.trim() || !name.trim() || !countryCode.trim()) return

    setSubmitting(true)
    setError(null)

    const payload = {
      shortCode: shortCode.trim().toLowerCase(),
      name: name.trim(),
      countryCode: countryCode.trim().toUpperCase(),
      city: city.trim() || undefined,
      description: description.trim() || undefined,
    }

    if (isEdit && id) {
      const res = await api.adminUpdateLocation(id, payload)
      if (res.ok) {
        navigate('/admin/locations')
      } else {
        setError(res.error.message || 'Failed to update location.')
      }
    } else {
      const res = await api.adminCreateLocation(payload)
      if (res.ok) {
        navigate('/admin/locations')
      } else {
        setError(res.error.message || 'Failed to create location.')
      }
    }

    setSubmitting(false)
  }

  return (
    <AppShell
      title={isEdit ? 'Edit Location' : 'New Location'}
      description="Configure regional datacenter placement and infrastructure metadata."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/locations')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Locations
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
              Infrastructure
            </span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">
              {isEdit ? 'Edit Zone' : 'New Zone'}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">
            {isEdit ? `Edit Location: ${name || 'Zone'}` : 'Register New Location'}
          </h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Define a geographic datacenter zone for compute clusters and instance placement.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading location details...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs"
          >
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent-text">
                <MapPin size={18} weight="bold" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-fg">Regional Parameters</h2>
                <p className="text-[11px] text-fg-subtle">
                  Short codes and country identifiers must align with regional standards.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Short Code <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value.toLowerCase())}
                  placeholder="us-east-1"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  Unique identifier (e.g. <code>us-east-1</code>, <code>eu-central-1</code>).
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Country Code (ISO 3166-1) <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={3}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  placeholder="US"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  2 or 3-letter uppercase country code (e.g. <code>US</code>, <code>DE</code>, <code>JP</code>).
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Display Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="US East (N. Virginia)"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  User-facing location label shown on node badges and selector menus.
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">City / Metro</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ashburn"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  Metropolitan area or city of the physical facility.
                </span>
              </div>

              <div className="md:col-span-2">
                <label className="text-[12px] font-semibold text-fg">Zone Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Primary North American datacenter cluster hosting general-purpose nodes..."
                  className="mt-1.5 w-full rounded-control border border-field-border bg-field p-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/admin/locations')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="gap-1.5"
              >
                <FloppyDisk size={16} />
                {submitting ? 'Saving...' : isEdit ? 'Update Location' : 'Create Location'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}
