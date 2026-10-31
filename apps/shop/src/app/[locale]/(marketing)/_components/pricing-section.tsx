import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import { SectionLabel } from "./section-label"

const pricingRows = [
  {
    resource: "vCPU",
    basis: "按分配的 vCPU-秒计算",
    price: "$0.0000098 / vCPU-second",
  },
  {
    resource: "Memory",
    basis: "按分配的 GiB-秒计算",
    price: "$0.0000032 / GiB-second",
  },
  {
    resource: "Storage",
    basis: "按小时计量，按天收费。包含前 60 GB",
    price: "$0.00009 / GB-hour",
  },
]

const exampleRows = [
  {
    config: "1 vCPU + 512 MiB RAM",
    usage: "Short-lived agent task (5 min)",
    cost: "~$0.0034",
  },
  {
    config: "2 vCPU + 1 GiB RAM",
    usage: "Code execution job (1 hr)",
    cost: "~$0.0821",
  },
  {
    config: "8 vCPU + 8 GiB RAM",
    usage: "Multi-agent or RL workload (1 hr)",
    cost: "~$0.3744",
  },
]

const freeTierFeatures = [
  "$ 100 免费使用额度",
  "5 个并发沙盒",
  "最长 1 小时会话时长",
  "每个沙盒 2 vCPU",
  "每个沙盒 4 GB RAM",
  "无优先调度",
]

const paidTierFeatures = [
  "按量付费",
  "100 个并发沙盒",
  "最长 24 小时会话时长",
  "每个沙盒最高 8 vCPU",
  "每个沙盒最高 8 GB RAM",
  "支持优先调度",
]

const tierPanelClassName =
  "glass-panel relative flex flex-col gap-4 overflow-hidden p-5 sm:p-8 md:bg-[url('/sandbox1/page/pricing/bg.png')] md:bg-cover md:bg-center md:p-12 lg:p-20 dark:md:bg-none dark:bg-gradient-to-br dark:from-primary/10 dark:via-card/50 dark:to-background"

const freeTierCardClassName =
  "glass-card w-full border-0 ring-0 md:w-1/2 dark:border dark:border-border/30 dark:bg-card/70"

const paidTierCardClassName =
  "glass-card w-full border border-primary/20 bg-primary/5 ring-0 md:w-1/2 dark:border-primary/35 dark:bg-primary/10"

export function PricingTierPanel({
  freeTierFeatures: freeFeatures,
  paidTierFeatures: paidFeatures,
}: {
  freeTierFeatures: string[]
  paidTierFeatures: string[]
}) {
  return (
    <div className={tierPanelClassName}>
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xl font-semibold text-foreground md:text-4xl">
            免费层与付费层
          </h3>
          <Button asChild size="lg" className="w-fit shrink-0 rounded-full px-6">
            <LocaleLink href="/console/sandbox">
              立即试用
              <ChevronRight className="size-4 shrink-0" />
            </LocaleLink>
          </Button>
        </div>

        <p className="text-base text-muted-foreground md:text-xl">
          从免费层开始，我们赠送 ¥100。充值余额即可自动解锁生产级资源
        </p>

        <div className="flex flex-col gap-3 md:flex-row">
          <Card className={freeTierCardClassName}>
            <CardHeader className="px-2 py-6">
              <CardTitle className="text-xl text-muted-foreground">
                免费层
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-2 py-6 text-base text-muted-foreground">
              {freeFeatures.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </CardContent>
          </Card>

          <Card className={paidTierCardClassName}>
            <CardHeader className="px-2 py-6">
              <CardTitle className="text-xl text-primary">付费层</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-2 py-6 text-base text-muted-foreground">
              {paidFeatures.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </CardContent>
          </Card>
        </div>

        <p className="text-base text-muted-foreground md:text-xl">
          账户余额高于 $0 后，将自动解锁付费层。
        </p>
      </div>
    </div>
  )
}

export function PricingTable({
  headers,
  rows,
  priceLabel = "单价",
}: {
  headers: [string, string, string]
  rows: { col1: string; col2: string; col3: string }[]
  priceLabel?: string
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30 hover:bg-transparent dark:border-border/40">
              <TableHead className="px-3 py-7 font-mono text-xs uppercase text-muted-foreground">
                {headers[0]}
              </TableHead>
              <TableHead className="px-3 py-7 font-mono text-xs uppercase text-muted-foreground">
                {headers[1]}
              </TableHead>
              <TableHead className="px-3 py-7 text-right font-mono text-xs uppercase text-muted-foreground">
                {priceLabel}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.col1}
                className="border-border/30 hover:bg-muted/20 dark:border-border/40 dark:hover:bg-muted/40"
              >
                <TableCell className="px-3 py-7 text-lg text-foreground whitespace-nowrap">
                  {row.col1}
                </TableCell>
                <TableCell className="px-3 py-7 text-lg text-muted-foreground whitespace-nowrap">
                  {row.col2}
                </TableCell>
                <TableCell className="px-3 py-7 text-right font-medium text-primary whitespace-nowrap">
                  {row.col3}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col md:hidden">
        {rows.map((row) => (
          <div
            key={row.col1}
            className="flex flex-col gap-6 border-b border-border/30 px-3 py-7 dark:border-border/40"
          >
            <div className="flex flex-col gap-2">
              <p className="text-lg leading-6 text-foreground">{row.col1}</p>
              <p className="text-lg leading-6 text-muted-foreground">
                {row.col2}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
                {priceLabel}
              </span>
              <span className="text-xl font-medium leading-[26px] text-primary">
                {row.col3}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function PricingSection() {
  return (
    <section id="pricing" className="marketing-section-alt">
      <div className="marketing-container">
        <div className="flex flex-col gap-0">
          <div className="flex flex-col gap-6">
            <SectionLabel>定价</SectionLabel>
            <div className="flex flex-col gap-4 py-4">
              <h2 className="marketing-heading">灵活的按使用量计费</h2>
              <p className="marketing-subheading">
                基于 vCPU 和内存分配按秒计费。无套餐、无锁定、无隐藏费用。{" "}
                <LocaleLink
                  href="/pricing?sandbox=1"
                  className="inline-flex items-center gap-2 font-medium text-foreground no-underline transition-opacity hover:opacity-70"
                >
                  了解更多
                  <ChevronRight className="size-3.5" />
                </LocaleLink>
              </p>
            </div>
          </div>

          <PricingTable
            headers={["计费依据", "计费依据", "单价"]}
            rows={pricingRows.map((r) => ({
              col1: r.resource,
              col2: r.basis,
              col3: r.price,
            }))}
          />

          <h2 className="marketing-heading mt-10">基于用量的计费示例</h2>

          <PricingTable
            headers={["示例配置", "使用示例", "预计费用"]}
            priceLabel="预估费用"
            rows={exampleRows.map((r) => ({
              col1: r.config,
              col2: r.usage,
              col3: r.cost,
            }))}
          />

          <p className="mb-16 mt-4 text-base">
            <span className="text-foreground/80">* 免费层配额：</span>
            <span className="text-muted-foreground">
              5 个并发沙盒，最长 1 小时会话。充值余额并使用沙盒，即可自动解锁付费层（100
              个并发，24 小时会话）。
            </span>
          </p>

          <PricingTierPanel
            freeTierFeatures={freeTierFeatures}
            paidTierFeatures={paidTierFeatures}
          />
        </div>
      </div>
    </section>
  )
}
