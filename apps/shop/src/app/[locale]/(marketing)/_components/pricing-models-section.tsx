import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import { PricingTable } from "./pricing-section"
import { SectionLabel } from "./section-label"

const modelPricingRows = [
  {
    model: "GPT-4o",
    input: "$2.50 / 1M tokens",
    output: "$10.00 / 1M tokens",
  },
  {
    model: "Claude 3.5 Sonnet",
    input: "$3.00 / 1M tokens",
    output: "$15.00 / 1M tokens",
  },
  {
    model: "DeepSeek V3",
    input: "$0.27 / 1M tokens",
    output: "$1.10 / 1M tokens",
  },
  {
    model: "Llama 3.3 70B",
    input: "$0.35 / 1M tokens",
    output: "$0.40 / 1M tokens",
  },
  {
    model: "Gemini 2.0 Flash",
    input: "$0.10 / 1M tokens",
    output: "$0.40 / 1M tokens",
  },
]

export function PricingModelsSection() {
  return (
    <section id="models" className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>模型 APIs</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">按 Token 透明计费</h2>
          <p className="marketing-subheading">
            200+ 个主流大模型统一 API 接入。按实际输入与输出 Token 计费，无套餐绑定，随用随付。
          </p>
        </div>

        <PricingTable
          headers={["模型", "输入", "输出"]}
          rows={modelPricingRows.map((row) => ({
            col1: row.model,
            col2: row.input,
            col3: row.output,
          }))}
          priceLabel="输出"
        />

        <p className="mt-4 text-base text-muted-foreground">
          价格因模型而异，上表为部分热门模型参考价。完整模型列表与实时定价请查看模型库。
        </p>

        <div className="mt-8">
          <Button asChild variant="outline" className="rounded-full">
            <LocaleLink href="/models">
              浏览全部模型
              <ChevronRight className="size-4" />
            </LocaleLink>
          </Button>
        </div>
      </div>
    </section>
  )
}
