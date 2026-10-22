import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/** Tweened number that animates between values; static under reduced motion. */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number
  format?: (n: number) => string
  className?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    if (reduce || from === value) {
      setDisplay(value)
      prevRef.current = value
      return
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
      onComplete: () => {
        prevRef.current = value
      },
    })
    return () => {
      controls.stop()
      prevRef.current = value
    }
  }, [value, reduce])

  return <span className={className}>{format(display)}</span>
}

/** Status dot that emits a one-shot ping when the status flips. */
export function StatusDot({ status }: { status: 'running' | 'stopped' | 'frozen' }) {
  const reduce = useReducedMotion()
  const [pinging, setPinging] = useState(false)
  const prevRef = useRef(status)

  useEffect(() => {
    if (prevRef.current !== status && !reduce) {
      prevRef.current = status
      setPinging(true)
      const timer = setTimeout(() => setPinging(false), 2500)
      return () => clearTimeout(timer)
    }
    prevRef.current = status
  }, [status, reduce])

  const running = status === 'running'
  const frozen = status === 'frozen'

  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden>
      {pinging && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
            running ? 'bg-emerald-400' : frozen ? 'bg-sky-400' : 'bg-zinc-500',
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-flex size-2.5 rounded-full',
          running
            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
            : frozen
              ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]'
              : 'bg-zinc-600',
        )}
      />
    </span>
  )
}

/** Table-shaped skeleton for first-paint loading states. */
export function TableSkeleton({ rows = 3, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse" aria-hidden>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-5 py-4">
              <div className="h-3.5 rounded-control bg-surface-2" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
