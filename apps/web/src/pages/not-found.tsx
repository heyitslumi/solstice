import { Link } from 'react-router-dom'

import { ThemeToggle } from '@/components/auth/theme-toggle'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'

export function NotFoundPage() {
  const { user, loading } = useSession()

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="absolute top-5 right-5 sm:top-6 sm:right-8">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
        <div className="flex w-full max-w-md flex-col items-start gap-5">
          <img src="/brand/solstice-mark.png" alt="" className="h-9 w-auto" />

          <span className="font-mono text-[11px] tracking-[0.28em] text-sun-500 uppercase">
            404
          </span>

          <h1 className="text-[clamp(1.6rem,3vw,2rem)] leading-tight font-semibold tracking-tight text-balance text-fg">
            We could not find that page.
          </h1>

          <p className="text-[14px] leading-relaxed text-fg-muted">
            The link may be broken, or the page may have moved. Nothing is wrong with your
            account.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Works whether or not anyone is signed in: /dashboard is guarded, so a
                signed-out visitor lands on the sign-in screen instead. */}
            <Link to="/dashboard">
              <Button>Go to dashboard</Button>
            </Link>

            {loading ? null : user ? (
              <Link to="/account">
                <Button variant="secondary">Account settings</Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
