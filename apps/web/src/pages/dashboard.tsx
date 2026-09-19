import { GearSix, Plus, Terminal } from '@phosphor-icons/react'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-panel border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function DashboardPage() {
  const { user, session } = useSession()

  return (
    <AppShell
      title={user ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Welcome back.'}
      description="This is the panel shell. Server provisioning is not connected yet."
      actions={
        <Button size="sm" variant="secondary" disabled title="Provisioning is not wired up yet">
          <Plus size={15} aria-hidden />
          New server
        </Button>
      }
    >
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Your servers">
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-control bg-surface-2 text-fg-subtle">
              <Terminal size={20} aria-hidden />
            </span>
            <p className="text-[14px] font-medium text-fg">No servers yet</p>
            <p className="max-w-[42ch] text-[13px] leading-relaxed text-fg-muted">
              Once a host is registered with the panel, servers you create will appear here with
              their state, limits and address.
            </p>
          </div>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Account">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Name</dt>
                <dd className="truncate text-[13px] text-fg">{user?.name ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Email</dt>
                <dd className="truncate font-mono text-[12px] text-fg">{user?.email ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Member since</dt>
                <dd className="font-mono text-[12px] text-fg">
                  {user ? formatDate(user.createdAt) : '—'}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Session">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Started</dt>
                <dd className="font-mono text-[12px] text-fg">
                  {session ? formatDate(session.createdAt) : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Expires</dt>
                <dd className="font-mono text-[12px] text-fg">
                  {session ? formatDate(session.expiresAt) : '—'}
                </dd>
              </div>
            </dl>
            <div className="flex items-start gap-2.5 border-t border-border px-5 py-3.5">
              <GearSix size={15} className="mt-px shrink-0 text-fg-subtle" aria-hidden />
              <p className="text-[12px] leading-relaxed text-fg-subtle">
                Sessions are stored hashed in the database. Password resets revoke every other
                session on the account.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}
