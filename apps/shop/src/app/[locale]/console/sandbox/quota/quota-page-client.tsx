"use client"

import { toast } from "sonner"
import type {
  SandboxQuotaItem,
  SandboxQuotaPageData,
} from "@/lib/sandbox-quota/types"
import { QuotaCustomCta } from "./_components/quota-custom-cta"
import { QuotaTable } from "./_components/quota-table"
import { QuotaTierCard } from "./_components/quota-tier-card"

interface QuotaPageClientProps {
  initialData: SandboxQuotaPageData
}

export function QuotaPageClient({ initialData }: QuotaPageClientProps) {
  function handleUpgrade() {
    toast.info("升级功能即将上线")
  }

  function handleIncreaseLimit(quota: SandboxQuotaItem) {
    toast.info(`正在申请提高「${quota.name}」的限制…`)
  }

  function handleContactSales() {
    toast.info("销售团队将尽快与您联系")
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="flex flex-col gap-4">
        <QuotaTierCard
          tier={initialData.tier}
          pricingHref={initialData.pricingHref}
          onUpgrade={handleUpgrade}
        />

        <main>
          <QuotaTable
            quotas={initialData.quotas}
            onIncreaseLimit={handleIncreaseLimit}
          />
        </main>

        <QuotaCustomCta
          customQuota={initialData.customQuota}
          onContactSales={handleContactSales}
        />
      </div>
    </div>
  )
}
