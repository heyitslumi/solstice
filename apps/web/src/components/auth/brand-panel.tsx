import { useAppConfig } from '@/lib/config'
import { PointerParallax } from './pointer-parallax'

const SUPPORTING_COPY =
  'Provision containers and virtual machines, snapshot them, and track usage from a single panel.'

export function BrandPanel() {
  const { config } = useAppConfig()

  return (
    <aside className="relative hidden overflow-hidden bg-brand-surface lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {config.banner ? (
        <img
          src={config.banner}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15"
        />
      ) : null}

      <PointerParallax className="absolute inset-0 mix-blend-screen">
        <div className="absolute -right-40 -bottom-56 size-[40rem] rounded-full sun-glow opacity-25 blur-[90px]" />
        <div className="absolute -right-16 -bottom-40 size-[26rem] rounded-full sun-glow opacity-40 blur-[50px]" />
      </PointerParallax>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sun-400/50 to-transparent"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 hairline-grid text-brand-ink/[0.035]" />

      <div className="relative flex items-center gap-3.5">
        <img
          src={config.icon || '/brand/mark.svg'}
          alt=""
          className="h-11 w-auto max-w-[44px] max-h-[44px] shrink-0 object-contain"
        />
        <div className="flex flex-col gap-1">
          <span className="text-[15px] leading-none font-semibold tracking-[0.26em] text-brand-ink uppercase">
            {config.name || 'Solstice'}
          </span>
          {(config.tagline || 'VPS Hosting') && (
            <span className="text-[9px] leading-none font-medium tracking-[0.4em] text-sun-500 uppercase">
              {config.tagline || 'VPS Hosting'}
            </span>
          )}
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
          {config.url ? new URL(config.url).host : window.location.host}
        </p>
      </div>
    </aside>
  )
}
