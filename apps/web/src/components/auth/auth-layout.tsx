import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { AuthFooter } from '@/components/auth/auth-footer'
import { BrandPanel } from '@/components/auth/brand-panel'
import { ThemeToggle } from '@/components/auth/theme-toggle'

function CompactBrand() {
  return (
    <div className="flex items-center gap-2.5 lg:hidden">
      <img src="/brand/solstice-mark.png" alt="" className="h-7 w-auto shrink-0" />
      <span className="text-[13px] leading-none font-semibold tracking-[0.24em] text-fg uppercase">
        Solstice
      </span>
    </div>
  )
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-[100dvh] lg:grid lg:h-[100dvh] lg:min-h-0 lg:grid-cols-[1.05fr_minmax(0,1fr)] lg:overflow-hidden">
      <BrandPanel />

      <main className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:min-h-0 lg:overflow-y-auto">
        <header className="auth-header flex items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:justify-end lg:px-12 lg:py-6">
          <CompactBrand />
          <ThemeToggle />
        </header>

        <div className="auth-body flex flex-1 items-center justify-center px-5 pb-10 sm:px-8 lg:px-12 lg:pb-6">
          <div key={pathname} className="w-full max-w-[26rem]">
            {children}
          </div>
        </div>

        <AuthFooter />
      </main>
    </div>
  )
}
