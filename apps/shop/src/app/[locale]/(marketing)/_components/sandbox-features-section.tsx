import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import Image from "next/image"
import { SectionLabel } from "./section-label"

const features = [
  {
    image: "/sandbox1/page/why-gpurun/level-startup.png",
    alt: "Sub-second startup under 200ms",
    title: "亚秒级启动",
    description:
      "平均在 200ms 内启动沙盒实例，针对突发性和高频工作负载进行了优化。",
  },
  {
    image: "/sandbox1/page/why-gpurun/isolation.png",
    alt: "Secure isolation tasks",
    title: "安全隔离",
    description:
      "每个任务都在具有系统级隔离的独立沙盒中运行，以降低数据泄露和未经授权访问的风险。",
  },
]

export function SandboxFeaturesSection() {
  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>智能体沙盒</SectionLabel>

        <div className="mt-6 flex max-w-[430px] flex-col items-start gap-4 py-4">
          <h2 className="marketing-heading">快速启动。强隔离。大规模并发。</h2>
          <p className="marketing-subheading">
            在毫秒级启动沙盒实例，隔离每个任务，并扩展到数千个并发执行，以应对真实的智能体工作负载。
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex min-w-0 flex-col gap-10 pb-10"
              >
                <div className="glass-surface relative h-[220px] w-full overflow-hidden rounded-xl border border-border/30 sm:h-[280px] lg:h-[320px]">
                  <Image
                    src={feature.image}
                    alt={feature.alt}
                    fill
                    className="object-cover object-center opacity-80"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/30 to-transparent"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex max-w-[382px] flex-col gap-4">
                  <h3 className="text-xl font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-lg text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel relative flex min-h-0 flex-col overflow-hidden bg-primary/5 px-6 py-8 md:px-12 lg:min-h-[389px] lg:flex-row lg:items-center lg:justify-between lg:pl-[100px] lg:pr-20 lg:py-10">
            <Image
              src="/sandbox1/page/operation-bg.png"
              alt=""
              fill
              className="object-cover opacity-30"
              sizes="100vw"
            />
            <div className="relative z-10 flex max-w-[361px] flex-col gap-8">
              <div className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-foreground">
                  规模化高并发
                </h3>
                <p className="text-lg text-muted-foreground">
                  并行运行数千个沙盒实例，并为高吞吐量智能体工作负载保持稳定的低延迟。
                </p>
              </div>
              <Button asChild size="lg" className="w-fit rounded-full px-6">
                <LocaleLink href="/console/sandbox" className="gap-1">
                  立即试用
                  <ChevronRight className="size-4 shrink-0" />
                </LocaleLink>
              </Button>
            </div>
            <div className="relative z-10 mt-8 flex w-full justify-center lg:mt-0 lg:w-[462px] lg:justify-end">
              <Image
                src="/sandbox1/page/operating.png"
                alt="正在运行 1,159 个实例"
                width={560}
                height={389}
                className="h-auto w-full max-w-[462px] object-contain opacity-90"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
