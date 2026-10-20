"use client"

import { Copy, QrCode } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"
import {
  formatBankTransferCopyText,
  formatRechargeAmountCny,
} from "@/lib/recharge-shared"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

interface RechargeBankTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount?: number | null
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`已复制${label}`)
  } catch {
    toast.error("复制失败，请手动复制")
  }
}

function StepBadge({ step }: { step: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {step}
    </span>
  )
}

export function RechargeBankTransferDialog({
  open,
  onOpenChange,
  amount,
}: RechargeBankTransferDialogProps) {
  const { data: bankAccounts } = trpc.payment.listBankAccounts.useQuery(
    undefined,
    { enabled: open },
  )

  const account = bankAccounts?.[0]
  const bankInfo = account
    ? {
        accountName: account.accountName,
        accountNumber: account.accountNo,
        bankName: account.bankName,
        bankBranch: account.bankBranch ?? "",
        remittanceCode: account.remark ?? "docsify@163.com",
      }
    : undefined

  const displayInfo = bankInfo ?? {
    accountName: "天津聚链科技有限公司",
    bankName: "中国农业银行股份有限公司津滨支行",
    accountNumber: "6228 4000 2701 2930 467",
    remittanceCode: "docsify@163.com",
  }

  const handleCopyAll = () => {
    const lines = [formatBankTransferCopyText(displayInfo)]
    if (amount != null) {
      lines.push(`转账金额：${formatRechargeAmountCny(amount)}`)
    }
    void copyText(lines.join("\n"), "对公转账信息")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl min-w-[50vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>对公转账</DialogTitle>
          <DialogDescription>
            请按以下步骤完成银行转账，我们将在收到款项后为您充值
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-1">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <StepBadge step={1} />
              <h3 className="text-sm font-semibold text-foreground">
                使用以下信息进行银行转账
              </h3>
            </div>

            <p className="text-sm leading-relaxed text-amber-600 dark:text-amber-500">
              <span className="font-medium">重要提醒：</span>
              请务必在银行转账的备注/用途/摘要栏中填写汇款识别码，这样我们才能快速识别您的转账并为您匹配充值订单、发放余额。
            </p>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    企业收款账户
                  </div>
                  <div className="text-xs tracking-wide text-muted-foreground uppercase">
                    Corporate Account
                  </div>
                </div>
                <Button size="sm" onClick={handleCopyAll}>
                  <Copy className="mr-1.5 size-3.5" />
                  一键复制对公转账信息
                </Button>
              </div>

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="mb-1 text-muted-foreground">户名</dt>
                  <dd className="font-medium text-foreground">
                    {displayInfo.accountName}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-muted-foreground">银行账号</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {displayInfo.accountNumber}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-muted-foreground">开户行</dt>
                  <dd className="font-medium text-foreground">
                    {displayInfo.bankName}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="mb-1 text-xs text-muted-foreground">
                  汇款识别码（转账时必须在备注/用途栏填入此识别码）
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-semibold text-primary">
                    {displayInfo.remittanceCode}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="复制汇款识别码"
                    onClick={() =>
                      copyText(displayInfo.remittanceCode, "汇款识别码")
                    }
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>

              {amount != null && (
                <p className="mt-3 text-sm text-muted-foreground">
                  转账金额请填写{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatRechargeAmountCny(amount)}
                  </span>
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <StepBadge step={2} />
              <h3 className="text-sm font-semibold text-foreground">
                转账完成后联系客服
              </h3>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground">
                    完成转账后请执行以下操作
                  </p>
                  <ol className="list-decimal space-y-2 pl-4">
                    <li>
                      <span className="font-medium text-foreground">
                        添加企业微信：
                      </span>
                      扫描右侧二维码添加企业微信客服
                    </li>
                    <li>
                      <span className="font-medium text-foreground">
                        提供转账信息：
                      </span>
                      给客服发送银行回单，作为转账成功的凭证
                    </li>
                    <li>
                      <span className="font-medium text-foreground">
                        等待到账：
                      </span>
                      我们将在 1–3 个工作日内完成充值与对账
                    </li>
                  </ol>
                  <p className="text-amber-600 dark:text-amber-500">
                    <span className="font-medium">特殊情况：</span>
                    如果转账时未填写汇款识别码，请通过企业微信详细说明
                  </p>
                  <p className="text-amber-600 dark:text-amber-500">
                    <span className="font-medium">开票说明：</span>
                    如需开具发票，请联系平台客服；仅实际支付且已消费的金额可开具发票
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-2 sm:pt-1">
                  <div className="flex size-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
                    <QrCode className="size-12 text-muted-foreground/60" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    企业微信客服
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
