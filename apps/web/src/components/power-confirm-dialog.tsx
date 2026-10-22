import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export type ConfirmablePowerAction = 'restart' | 'stop' | 'freeze'

const LABELS: Record<ConfirmablePowerAction, { title: string; verb: string; button: string }> = {
  restart: { title: 'Confirm restart', verb: 'restart', button: 'Restart' },
  stop: { title: 'Confirm stop', verb: 'stop', button: 'Stop' },
  freeze: { title: 'Confirm freeze', verb: 'freeze', button: 'Freeze' },
}

export function PowerConfirmDialog({
  open,
  action,
  serverName,
  working,
  onConfirm,
  onCancel,
}: {
  open: boolean
  action: ConfirmablePowerAction
  serverName: string
  working: boolean
  onConfirm: (force: boolean) => void
  onCancel: () => void
}) {
  const [force, setForce] = useState(false)
  const labels = LABELS[action]
  const supportsForce = action === 'restart' || action === 'stop'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setForce(false)
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>
          This will {labels.verb} <span className="font-mono font-semibold text-fg">{serverName}</span>.
        </DialogDescription>
        <p className="mt-2 text-[12px] text-fg-subtle">
          Next time, you can skip this confirmation by holding{' '}
          <kbd className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg">
            SHIFT
          </kbd>{' '}
          and clicking the action.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {supportsForce ? (
            <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-fg">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
              Force {labels.verb}
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="secondary"
              disabled={working}
              onClick={() => {
                setForce(false)
                onCancel()
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={working}
              onClick={() => {
                onConfirm(supportsForce && force)
                setForce(false)
              }}
            >
              {working ? `${labels.button}ing...` : labels.button}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
