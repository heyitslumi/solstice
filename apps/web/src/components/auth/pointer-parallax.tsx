import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, type ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const MAX_SHIFT_PX = 28

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value))

export function PointerParallax({ children, className, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)

  const smoothX = useSpring(rawX, { stiffness: 55, damping: 18, mass: 0.7 })
  const smoothY = useSpring(rawY, { stiffness: 55, damping: 18, mass: 0.7 })

  const shiftX = useTransform(smoothX, [-1, 1], [-MAX_SHIFT_PX, MAX_SHIFT_PX])
  const shiftY = useTransform(smoothY, [-1, 1], [-MAX_SHIFT_PX, MAX_SHIFT_PX])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const onPointerMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const isInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (!isInside) {
        rawX.set(0)
        rawY.set(0)
        return
      }

      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      rawX.set(clampUnit((event.clientX - centerX) / (rect.width / 2)))
      rawY.set(clampUnit((event.clientY - centerY) / (rect.height / 2)))
    }

    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [rawX, rawY])

  return (
    <div ref={ref} className={cn('pointer-events-none overflow-hidden', className)} {...props}>
      <motion.div className="absolute inset-0" style={{ x: shiftX, y: shiftY }}>
        {children}
      </motion.div>
    </div>
  )
}
