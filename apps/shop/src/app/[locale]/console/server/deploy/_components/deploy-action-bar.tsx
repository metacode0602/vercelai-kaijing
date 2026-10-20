"use client"

import { cn } from "@/lib/utils"
import { formatCNY } from "@/lib/server-market-data"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"

interface DeployActionBarProps {
  region: string
  gpuLabel: string
  vcpu: number
  memoryGb: number
  systemDiskGb: number
  dataDiskLabel: string
  priceAmount: number
  priceUnit: string
  voucherDeduction?: number
  voucherSummary?: string
  payableAmount: number
  balance: number
  canSubmit: boolean
  submitting?: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function DeployActionBar({
  region,
  gpuLabel,
  vcpu,
  memoryGb,
  systemDiskGb,
  dataDiskLabel,
  priceAmount,
  priceUnit,
  voucherDeduction = 0,
  voucherSummary,
  payableAmount,
  balance,
  canSubmit,
  submitting,
  onCancel,
  onSubmit,
}: DeployActionBarProps) {
  const insufficientBalance =
    priceUnit === "时" && payableAmount > 0 && balance < payableAmount

  const submitDisabled = !canSubmit || insufficientBalance

  return (
    <section className="flex shrink-0 flex-col border-t border-border bg-background transition-[width,height] ease-linear">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max gap-4 text-sm">
              <SpecColumn label="地区" value={region} />
              <SpecColumn label="GPU型号" value={gpuLabel} />
              <SpecColumn label="vCPU" value={`${vcpu} 核心`} />
              <SpecColumn label="内存" value={`${memoryGb} GB`} />
              <SpecColumn label="系统盘" value={`${systemDiskGb} GB`} />
              <SpecColumn label="数据盘" value={dataDiskLabel} multiline />
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">配置费用:</span>
                {voucherDeduction > 0 ? (
                  <>
                    <span className="text-muted-foreground line-through">
                      {formatCNY(priceAmount)} / {priceUnit}
                    </span>
                    <span className="font-semibold text-primary">
                      {formatCNY(payableAmount)} / {priceUnit}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold">
                    {formatCNY(priceAmount)} / {priceUnit}
                  </span>
                )}
                <button type="button" className="text-xs text-primary hover:underline">
                  费用明细
                </button>
              </div>
              {voucherDeduction > 0 && voucherSummary && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>算力券:</span>
                  <span className="text-primary">{voucherSummary}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">账户余额:</span>
                <span className="font-semibold">{formatCNY(balance)}</span>
                {insufficientBalance && (
                  <LocaleLink
                    href="/console/billing"
                    className="text-xs text-destructive hover:underline"
                  >
                    余额不足，去充值
                  </LocaleLink>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                取消
              </Button>
              <Button
                type="button"
                disabled={submitDisabled || submitting}
                onClick={onSubmit}
                className="min-w-[96px]"
              >
                {insufficientBalance ? "余额不足" : submitting ? "创建中..." : "立即创建"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SpecColumn({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="min-w-[72px]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-medium", multiline && "leading-snug")}>{value}</div>
    </div>
  )
}
