import { PricingTable, PricingTierPanel } from "./pricing-section"
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
    usage: "短时智能体任务（5 分钟）",
    cost: "~$0.0034",
  },
  {
    config: "2 vCPU + 1 GiB RAM",
    usage: "代码执行任务（1 小时）",
    cost: "~$0.0821",
  },
  {
    config: "8 vCPU + 8 GiB RAM",
    usage: "多智能体或 RL 工作负载（1 小时）",
    cost: "~$0.3744",
  },
]

const freeTierFeatures = [
  "¥100 免费使用额度",
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

export function PricingSandboxSection() {
  return (
    <section id="sandbox" className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>Agent 沙盒</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">灵活的按使用量计费</h2>
          <p className="marketing-subheading">
            基于 vCPU 和内存分配按秒计费。无套餐、无锁定、无隐藏费用。为 AI
            智能体提供安全、可编程的沙盒运行时。
          </p>
        </div>

        <PricingTable
          headers={["资源", "计费依据", "单价"]}
          rows={pricingRows.map((r) => ({
            col1: r.resource,
            col2: r.basis,
            col3: r.price,
          }))}
        />

        <h3 className="marketing-heading mt-10">基于用量的计费示例</h3>

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
    </section>
  )
}
