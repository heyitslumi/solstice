import { PointerParallax } from './pointer-parallax'

const SUPPORTING_COPY =
  'Provision containers and virtual machines, snapshot them, and track usage from a single panel.'

export function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-surface lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <PointerParallax className="absolute inset-0 mix-blend-screen">
        <div className="absolute -right-56 -bottom-80 size-[46rem] rounded-full sun-gradient opacity-25 blur-[100px]" />
        <div className="absolute -right-28 -bottom-64 size-[32rem] rounded-full sun-gradient opacity-45 blur-[30px]" />
      </PointerParallax>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sun-400/50 to-transparent"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 hairline-grid text-brand-ink/[0.035]" />

      <div className="relative flex items-center gap-3.5">
        <img src="/brand/solstice-mark.png" alt="" className="h-11 w-auto shrink-0" />
        <div className="flex flex-col gap-1">
          <span className="text-[15px] leading-none font-semibold tracking-[0.26em] text-brand-ink uppercase">
            Solstice
          </span>
          <span className="text-[9px] leading-none font-medium tracking-[0.4em] text-sun-500 uppercase">
            VPS Hosting
          </span>
        </div>
      </div>

      <div className="relative flex max-w-[32rem] flex-col gap-5">
        <h2 className="text-[clamp(1.6rem,2.2vw,2rem)] leading-[1.18] font-semibold tracking-tight text-balance text-brand-ink">
          Every server you run, in one console.
        </h2>
        <p className="max-w-[46ch] text-[14px] leading-relaxed text-brand-ink/60">
          {SUPPORTING_COPY}
        </p>
        <p className="flex items-center gap-2 pt-1 font-mono text-[11px] tracking-wide text-brand-ink/35">
          <span aria-hidden className="size-1.5 rounded-full bg-sun-500" />
          solstice.host
        </p>
      </div>
    </aside>
  )
}
