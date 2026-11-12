import { cn } from "@workspace/ui/lib/utils"
import {
  Boxes,
  Calculator,
  ClipboardCheck,
  Package,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react"
import { SectionLabel } from "./section-label"
import { capabilitiesContent } from "../_content/landing"

const icons: LucideIcon[] = [Store, Package, Truck, Boxes, Calculator, ClipboardCheck]

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="marketing-section scroll-mt-24">
      <div className="marketing-container">
        <SectionLabel>{capabilitiesContent.label}</SectionLabel>

        <div className="mt-6 flex max-w-[560px] flex-col gap-4">
          <h2 className="marketing-heading">{capabilitiesContent.title}</h2>
          <p className="marketing-subheading">
            {capabilitiesContent.description}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-y-6 pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {capabilitiesContent.items.map((item, index) => {
            const Icon = icons[index] ?? Store

            return (
              <div
                key={item.number}
                className={cn(
                  "flex flex-col gap-6 border-border/30 p-4 md:pr-10 md:pb-4 md:pt-6",
                  "sm:border-l sm:pl-6",
                  index % 2 === 0 ? "sm:border-l-0 sm:pl-0" : "",
                  index % 3 === 0
                    ? "lg:border-l-0 lg:pl-0"
                    : "lg:border-l lg:pl-10",
                )}
              >
                <span className="font-mono text-sm leading-none text-muted-foreground">
                  {item.number}
                </span>
                <div className="flex h-[96px] items-end md:h-[116px]">
                  <div className="glass-surface rounded-xl border border-border/20 p-4">
                    <Icon
                      className="size-12 text-primary/80 md:size-14"
                      strokeWidth={1.25}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-5">
                  <h3 className="text-xl font-semibold leading-[26px] text-foreground md:text-2xl">
                    {item.title}
                  </h3>
                  <p className="text-[15px] leading-[22px] text-muted-foreground md:text-lg md:leading-[26px]">
                    {item.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
