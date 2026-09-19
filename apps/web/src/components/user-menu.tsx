import {
  CaretRight,
  Check,
  DotsThreeVertical,
  Moon,
  SignOut,
  Sun,
  UserCircle,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link, useNavigate } from 'react-router-dom'

import { useSession } from '@/lib/session'
import { useTheme } from '@/lib/theme'

/** There is no avatar upload, so the row is identified by initials instead. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

const ITEM =
  'flex cursor-default items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] outline-none'

export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useSession()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  const name = user?.name ?? 'Account'

  return (
    <DropdownMenu.Root>
      <div className="flex items-center gap-1.5 rounded-control border border-border bg-surface-2/40 p-1.5">
        <Link
          to="/account"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 py-1 transition-colors duration-150 hover:bg-surface-2"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border/80"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[12px] font-medium text-accent-text">
              {initials(name)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{name}</span>
        </Link>

        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex size-8 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            <DotsThreeVertical size={18} weight="bold" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
      </div>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={8}
          className="z-50 min-w-[11rem] rounded-control border border-border bg-surface p-1 shadow-xl"
        >
          <DropdownMenu.Item
            className={`${ITEM} text-fg data-[highlighted]:bg-surface-2`}
            onSelect={() => {
              onNavigate?.()
              navigate('/account')
            }}
          >
            <UserCircle size={16} aria-hidden />
            Account
          </DropdownMenu.Item>

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={`${ITEM} text-fg data-[highlighted]:bg-surface-2 data-[state=open]:bg-surface-2`}
            >
              {theme === 'dark' ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
              Theme
              <CaretRight size={13} className="ml-auto text-fg-subtle" aria-hidden />
            </DropdownMenu.SubTrigger>

            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={4}
                className="z-50 min-w-[9rem] rounded-control border border-border bg-surface p-1 shadow-xl"
              >
                {(['light', 'dark'] as const).map((option) => (
                  <DropdownMenu.Item
                    key={option}
                    className={`${ITEM} text-fg capitalize data-[highlighted]:bg-surface-2`}
                    onSelect={() => setTheme(option)}
                  >
                    <span className="flex w-4 justify-center">
                      {theme === option ? <Check size={13} weight="bold" aria-hidden /> : null}
                    </span>
                    {option}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className={`${ITEM} text-danger data-[highlighted]:bg-danger-surface`}
            onSelect={() => {
              onNavigate?.()
              void signOut()
            }}
          >
            <SignOut size={16} aria-hidden />
            Logout
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}