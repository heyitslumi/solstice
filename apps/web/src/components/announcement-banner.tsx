import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { api, type ApiAnnouncement } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AnnouncementBanners() {
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([])
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('solstice_dismissed_announcements')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    api.listAnnouncements().then((res) => {
      if (res.ok && res.data) {
        setAnnouncements(res.data.announcements)
      }
    })
  }, [])

  function handleDismiss(id: string) {
    const updated = { ...dismissed, [id]: true }
    setDismissed(updated)
    try {
      localStorage.setItem('solstice_dismissed_announcements', JSON.stringify(updated))
    } catch {
      // Ignore storage quota errors
    }
  }

  const visible = announcements.filter((a) => !dismissed[a.id])
  if (visible.length === 0) return null

  return (
    <div className="mb-6 flex flex-col gap-3">
      {visible.map((ann) => {
        const type = ann.type?.toLowerCase() || 'info'

        let themeClasses = 'border-blue-500/30 bg-blue-500/10 text-blue-200'
        let icon = <Info size={20} className="text-blue-400 shrink-0 mt-0.5" />

        if (type === 'warning') {
          themeClasses = 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          icon = <Warning size={20} className="text-amber-400 shrink-0 mt-0.5" />
        } else if (type === 'danger') {
          themeClasses = 'border-red-500/30 bg-red-500/10 text-red-200'
          icon = <WarningCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
        } else if (type === 'success') {
          themeClasses = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          icon = <CheckCircle size={20} className="text-emerald-400 shrink-0 mt-0.5" />
        }

        return (
          <div
            key={ann.id}
            className={cn(
              'relative flex items-start gap-3 rounded-control border p-4 transition-all',
              themeClasses,
            )}
          >
            {icon}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h4 className="text-[14px] font-semibold tracking-tight text-fg">
                {ann.title}
              </h4>
              <div className="text-[13px] text-fg-subtle whitespace-pre-wrap leading-relaxed">
                {ann.content}
              </div>
            </div>
            {ann.dismissible && (
              <button
                type="button"
                aria-label="Dismiss announcement"
                onClick={() => handleDismiss(ann.id)}
                className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
