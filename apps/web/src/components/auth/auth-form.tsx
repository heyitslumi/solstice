import { useEffect, useRef, useState, type ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const SETTLE_FALLBACK_MS = 1500

/**
 * The auth form shell. It owns the layout and the entrance stagger, and it
 * disarms the stagger once the entrance has finished playing.
 *
 * Dropping the class matters: while `stagger-children` is present every field
 * carries an `animation`, so anything that re-creates a field — a keystroke
 * that remounts a subtree, a fast-refresh update — replays the entrance. With
 * no animation left on the nodes there is nothing to replay. Removing the
 * class is visually a no-op, because the keyframes end on the untransformed,
 * fully opaque state.
 */
export function AuthForm({ children, className, ...props }: ComponentProps<'form'>) {
  const ref = useRef<HTMLFormElement>(null)
  const [entering, setEntering] = useState(true)

  useEffect(() => {
    if (!entering) return
    const el = ref.current
    if (!el) return

    const disarm = () => {
      setEntering(false)
    }

    // The last child carries the longest delay, so its animation ends last.
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === el.lastElementChild) disarm()
    }

    const fallback = window.setTimeout(disarm, SETTLE_FALLBACK_MS)
    el.addEventListener('animationend', onAnimationEnd)

    return () => {
      window.clearTimeout(fallback)
      el.removeEventListener('animationend', onAnimationEnd)
    }
  }, [entering])

  return (
    <form
      ref={ref}
      className={cn('auth-form flex flex-col gap-5', entering && 'stagger-children', className)}
      {...props}
    >
      {children}
    </form>
  )
}
