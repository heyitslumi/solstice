import { useEffect, useState } from 'react'
import cliSpinners, { type SpinnerName } from 'cli-spinners'

interface CliSpinnerProps {
  name?: SpinnerName
  className?: string
}

/**
 * Terminal / Braille spinner component using cli-spinners.
 * Defaults to 'dots' (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏).
 */
export function CliSpinner({ name = 'dots', className = '' }: CliSpinnerProps) {
  const spinner = cliSpinners[name] || cliSpinners.dots
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % spinner.frames.length)
    }, spinner.interval)

    return () => clearInterval(timer)
  }, [spinner])

  return (
    <span
      aria-hidden="true"
      className={`inline-block font-mono leading-none select-none ${className}`}
    >
      {spinner.frames[frameIndex]}
    </span>
  )
}
