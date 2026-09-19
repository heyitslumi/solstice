import { Moon, Sun } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="text-fg-subtle"
    >
      {isDark ? (
        <Sun size={18} className="animate-scale-in" aria-hidden />
      ) : (
        <Moon size={18} className="animate-scale-in" aria-hidden />
      )}
    </Button>
  )
}
