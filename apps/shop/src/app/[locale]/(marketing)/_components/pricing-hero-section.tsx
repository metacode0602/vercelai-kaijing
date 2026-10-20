import Image from "next/image"

export function PricingHeroSection() {
  return (
    <section className="relative w-full overflow-hidden bg-muted/25">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Image
          src="/sandbox1/page/bg.png"
          alt=""
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-20"
        aria-hidden="true"
        style={{
          background: "linear-gradient(to bottom, transparent, hsl(var(--muted) / 0.25))",
        }}
      />

      <div className="relative z-10 min-h-[700px]">
        <div className="mx-auto flex w-full max-w-[1512px] flex-col items-start px-5 pt-[215px] md:px-12 lg:px-[124px]">
          <div className="flex max-w-[700px] flex-col gap-6">
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-[2px] bg-primary"
                aria-hidden="true"
              />
              <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
                定价
              </span>
            </div>

            <div className="flex flex-col gap-4">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                从创意到企业级的无缝扩展定价
              </h1>
              <p className="max-w-[560px] text-lg text-muted-foreground">
                探索我们的模型 APIs 和 GPU 资源的定价。通过透明的费率和灵活的选项，找到符合您需求的合适方案。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
