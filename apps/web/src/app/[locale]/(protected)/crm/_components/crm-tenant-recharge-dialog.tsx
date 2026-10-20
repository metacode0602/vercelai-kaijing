"use client"

import * as React from "react"
import { Button } from "@workspace/ui/components/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc/client"
import { Textarea } from "@workspace/ui/components/textarea"

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "银行转账" },
  { value: "wechat", label: "微信" },
  { value: "alipay", label: "支付宝" },
  { value: "invoice", label: "发票对公" },
]

export function CrmTenantRechargeDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  tenantName: string
  onCreated?: () => void
}) {
  const [amount, setAmount] = React.useState("")
  const [paymentMethod, setPaymentMethod] = React.useState("bank_transfer")
  const [remark, setRemark] = React.useState("")

  const utils = trpc.useUtils()
  const createMutation = trpc.crm.tenants.recharge.create.useMutation({
    onSuccess: () => {
      toast.success("线下充值成功")
      setAmount("")
      setPaymentMethod("bank_transfer")
      setRemark("")
      onOpenChange(false)
      void utils.crm.tenants.listRecharges.invalidate({ tenantId })
      void utils.crm.tenants.getById.invalidate({ id: tenantId })
      onCreated?.()
    },
    onError: (err) => {
      toast.error(err.message || "充值失败，请重试")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!amount || numAmount <= 0) {
      toast.error("请输入有效的充值金额")
      return
    }
    createMutation.mutate({
      tenantId,
      amount: numAmount,
      paymentMethod,
      remark: remark.trim() || undefined,
    })
  }

  const isPending = createMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>线下充值</DialogTitle>
          <DialogDescription>
            为租户「{tenantName}」创建线下充值记录，充值金额将直接入账。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">充值金额 (元)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="请输入充值金额"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paymentMethod">支付方式</Label>
              <Select
                value={paymentMethod}
                onValueChange={setPaymentMethod}
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="remark">备注</Label>
              <Textarea
                id="remark"
                placeholder="充值备注（租户可见）"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <IconLoader2 className="mr-1.5 size-4 animate-spin" />}
              确认充值
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
