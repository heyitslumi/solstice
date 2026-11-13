export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <header className="relative overflow-hidden pt-32 pb-12 sm:pt-36">
      <div className="pointer-events-none absolute inset-0 bg-grid" aria-hidden />
      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <p className="font-mono text-[11px] tracking-[0.18em] text-sun-300/90 uppercase">{eyebrow}</p>
        <h1 className="mt-5 max-w-[24ch] text-balance text-[2.25rem] leading-[1.06] font-semibold tracking-[-0.03em] sm:text-5xl lg:text-[3.25rem]">
          {title}
        </h1>
        {children ? (
          <div className="mt-6 max-w-[62ch] text-pretty text-[16.5px] leading-relaxed text-white/60">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  )
}
