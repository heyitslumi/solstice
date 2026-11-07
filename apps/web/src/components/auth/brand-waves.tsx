import { useEffect, useRef } from 'react'

/**
 * WavyWavesBg from color4bg
 * Renders an animated silky fluid wave with customizable colors.
 */
export function BrandWavesBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let bgInstance: any = null
    let active = true

    // Dynamically import to ensure browser WebGL environment
    // @ts-expect-error color4bg does not ship TypeScript definitions
    void import('color4bg').then(({ WavyWavesBg }) => {
      if (!active || !el) return

      try {
        bgInstance = new WavyWavesBg({
          dom: el,
          // Solstice Ember palette: deep ink, dark ember, vibrant sun orange, gold, and dark navy
          colors: [
            '#0a1018', // deep background slate
            '#1d273b', // solstice navy
            '#7c2d12', // deep burnt amber
            '#c2410c', // rich ember
            '#fd9d1e', // solstice sun gold
            '#fe5c36', // vibrant flame accent
          ],
          seed: 1000,
          loop: true,
        })
      } catch (err) {
        console.warn('Failed to initialize WavyWavesBg:', err)
      }
    })

    return () => {
      active = false
      if (bgInstance && typeof bgInstance.destroy === 'function') {
        try {
          bgInstance.destroy()
        } catch {
          // ignore
        }
      }
      if (el) {
        el.replaceChildren()
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 size-full overflow-hidden"
      style={{ opacity: 0.65 }}
    />
  )
}
