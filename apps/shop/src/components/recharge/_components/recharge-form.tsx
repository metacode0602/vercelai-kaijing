"use client"

import { useState } from "react"
import { Building2, Loader2, QrCode, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  formatRechargeAmountCny,
  RECHARGE_FORM_PAYMENT_METHODS,
  RECHARGE_PRESET_AMOUNTS,
  type RechargeAmountSelection,
  type RechargePaymentMethod,
} from "@/lib/recharge-shared"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { RechargeBankTransferDialog } from "./recharge-bank-transfer-dialog"
import { VerificationGuard } from "@/components/verify/verification-guard"
import { trpc } from "@/trpc/client"

const PAYMENT_METHOD_ICONS: Record<RechargePaymentMethod, typeof Smartphone> = {
  wechat: Smartphone,
  alipay: Smartphone,
  bank_transfer: Building2,
}

interface RechargeFormProps {
  balance?: number
  onRecharge?: (input: {
    amount: number
    paymentMethod: RechargePaymentMethod
  }) => void | Promise<void>
}

function parseRechargeAmount(
  selection: RechargeAmountSelection,
  customAmount: string,
): number | null {
  if (selection === "custom") {
    const amount = Number(customAmount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return amount
  }
  return selection
}

export function RechargeForm({ onRecharge }: RechargeFormProps) {
  const identityQuery = trpc.identity.getStatus.useQuery()
  const verified = identityQuery.data?.isVerified === true
  const [amountSelection, setAmountSelection] =
    useState<RechargeAmountSelection>(10)
  const [customAmount, setCustomAmount] = useState("")
  const [paymentMethod, setPaymentMethod] =
    useState<RechargePaymentMethod>("wechat")
  const [submitting, setSubmitting] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [bankTransferDialogOpen, setBankTransferDialogOpen] = useState(false)
  const [pendingPayment, setPendingPayment] = useState<{
    amount: number
    paymentMethod: RechargePaymentMethod
  } | null>(null)

  const resolvedAmount = parseRechargeAmount(amountSelection, customAmount)
  const paymentMethodLabel =
    RECHARGE_FORM_PAYMENT_METHODS.find((item) => item.value === paymentMethod)
      ?.label ?? paymentMethod

  const openBankTransferDialog = () => {
    setPaymentMethod("bank_transfer")
    setBankTransferDialogOpen(true)
  }

  const handlePaymentMethodChange = (value: RechargePaymentMethod) => {
    setPaymentMethod(value)
    if (value === "bank_transfer") {
      setBankTransferDialogOpen(true)
    }
  }

  const handleSubmit = async () => {
    const amount = parseRechargeAmount(amountSelection, customAmount)
    if (amount === null) {
      toast.error(
        amountSelection === "custom" ? "请输入有效的自定义金额" : "请选择充值金额",
      )
      return
    }

    if (paymentMethod === "bank_transfer") {
      setBankTransferDialogOpen(true)
      return
    }

    setSubmitting(true)
    try {
      await onRecharge?.({ amount, paymentMethod })
      setPendingPayment({ amount, paymentMethod })
      setPaymentDialogOpen(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card className="mb-7">
        <CardHeader>
          <CardTitle>账户充值</CardTitle>
          <CardDescription>
            选择充值金额与支付方式，支持微信、支付宝及对公转账
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>充值金额</Label>
            <div className="flex flex-wrap gap-2">
              {RECHARGE_PRESET_AMOUNTS.map((amount) => {
                const selected = amountSelection === amount
                return (
                  <Button
                    key={amount}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className={cn(
                      "min-w-[72px] tabular-nums",
                      selected && "ring-1 ring-primary",
                    )}
                    onClick={() => setAmountSelection(amount)}
                  >
                    {formatRechargeAmountCny(amount)}
                  </Button>
                )
              })}
              <Button
                type="button"
                variant={amountSelection === "custom" ? "default" : "outline"}
                className={cn(
                  amountSelection === "custom" && "ring-1 ring-primary",
                )}
                onClick={() => setAmountSelection("custom")}
              >
                自定义金额
              </Button>
            </div>
            {amountSelection === "custom" && (
              <div className="max-w-xs space-y-2">
                <Label htmlFor="recharge-custom-amount">自定义金额（元）</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-sm text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    id="recharge-custom-amount"
                    type="number"
                    min={0.01}
                    step="0.01"
                    placeholder="请输入金额"
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>支付方式</Label>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) =>
                value && handlePaymentMethodChange(value as RechargePaymentMethod)
              }
              className="grid grid-cols-1 gap-3 md:grid-cols-3"
            >
              {RECHARGE_FORM_PAYMENT_METHODS.map((item) => {
                const Icon = PAYMENT_METHOD_ICONS[item.value]
                const selected = paymentMethod === item.value
                const isBankTransfer = item.value === "bank_transfer"

                return (
                  <Label
                    key={item.value}
                    htmlFor={`payment-${item.value}`}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50",
                      selected && "border-primary ring-1 ring-primary",
                    )}
                    onClick={
                      isBankTransfer
                        ? (event) => {
                            event.preventDefault()
                            openBankTransferDialog()
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <RadioGroupItem
                      id={`payment-${item.value}`}
                      value={item.value}
                      onClick={
                        isBankTransfer
                          ? (event) => {
                              event.stopPropagation()
                              openBankTransferDialog()
                            }
                          : undefined
                      }
                    />
                  </Label>
                )
              })}
            </RadioGroup>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">
              应付金额
              <span className="ml-2 text-lg font-semibold tabular-nums text-foreground">
                {resolvedAmount !== null
                  ? formatRechargeAmountCny(resolvedAmount)
                  : "—"}
              </span>
            </div>
            <VerificationGuard verified={verified}>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    处理中…
                  </>
                ) : paymentMethod === "bank_transfer" ? (
                  "查看转账信息"
                ) : (
                  "立即充值"
                )}
              </Button>
            </VerificationGuard>
          </div>
        </CardContent>
      </Card>

      <RechargeBankTransferDialog
        open={bankTransferDialogOpen}
        onOpenChange={setBankTransferDialogOpen}
        amount={resolvedAmount}
      />

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{paymentMethodLabel}</DialogTitle>
            <DialogDescription>
              请使用{paymentMethodLabel}扫描下方二维码完成支付
            </DialogDescription>
          </DialogHeader>
          {pendingPayment && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="flex size-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
                <QrCode className="size-16 text-muted-foreground/60" />
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">支付金额</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatRechargeAmountCny(pendingPayment.amount)}
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                支付完成后，余额将在 1–5 分钟内到账
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
            >
              关闭
            </Button>
            <Button onClick={() => setPaymentDialogOpen(false)}>
              我已完成支付
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
