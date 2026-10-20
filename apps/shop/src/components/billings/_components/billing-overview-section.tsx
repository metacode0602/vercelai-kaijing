"use client"

import { CircleHelp, CreditCard } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import type { BillingAutoTopUp, BillingCreditSummary, BillingVoucher } from "@/lib/billing-data"
import { formatAvailableCredit, formatBillingAmount } from "@/lib/billing-data"

interface BillingOverviewSectionProps {
  credit: BillingCreditSummary
  vouchers: BillingVoucher[]
  autoTopUp: BillingAutoTopUp
  topUpAmount: string
  onTopUpAmountChange: (value: string) => void
  onRedeemVoucher: () => void
  onTopUp: () => void
  onAutoTopUpChange: (enabled: boolean) => void
  onAutoTopUpSettings: () => void
  onAddPaymentMethod: () => void
}

export function BillingOverviewSection({
  credit,
  vouchers,
  autoTopUp,
  topUpAmount,
  onTopUpAmountChange,
  onRedeemVoucher,
  onTopUp,
  onAutoTopUpChange,
  onAutoTopUpSettings,
  onAddPaymentMethod,
}: BillingOverviewSectionProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 w-full">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-col gap-1">
                <div className="text-sm font-medium text-foreground">可用额度</div>
                <div className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatAvailableCredit(credit.availableCredit)}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span>账户余额</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex text-muted-foreground hover:text-foreground"
                            aria-label="账户余额说明"
                          >
                            <CircleHelp className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          可用于抵扣服务费用的账户余额
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="tabular-nums text-foreground">
                    {formatBillingAmount(credit.accountBalance, true)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-foreground">代金券</span>
                  <span className="text-xs text-muted-foreground">
                    费用按以下顺序扣除：Coding Plan &gt; 代金券 &gt; 账户余额 &gt; 信用额度
                  </span>
                </div>
                <Button
                  size="sm"
                  className="h-7 shrink-0 rounded-full px-2.5"
                  onClick={onRedeemVoucher}
                >
                  兑换
                </Button>
              </div>
              {vouchers.length === 0 ? (
                <span className="text-sm text-muted-foreground">暂无有效代金券</span>
              ) : (
                <ul className="space-y-2">
                  {vouchers.map((voucher) => (
                    <li
                      key={voucher.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{voucher.name}</span>
                      <span className="tabular-nums">
                        {formatBillingAmount(voucher.balance, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
