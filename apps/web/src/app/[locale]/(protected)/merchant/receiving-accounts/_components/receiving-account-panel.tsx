'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Textarea } from '@workspace/ui/components/textarea'
import { Badge } from '@workspace/ui/components/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ListPagination } from '@/components/shared/list-pagination'
import { InfoIcon } from 'lucide-react'

/**
 * 平台 → 商户 专用收款账户（商户预付 / 对公转账）
 *
 * 这是「商户能否自助预付」的总开关：某商户没有启用的专用账户时，商户端
 * `prepay.create` 直接以 NoReceivingAccountError 拒绝建单，不会产生转不了款的单。
 *
 * 与 payout-accounts（商户 → 平台）方向相反，这里是平台配置、商户只读。
 */

interface MerchantOption {
  id: string
  name: string
}

interface Props {
  accounts: {
    items: Array<{
      id: string
      merchantId: string
      merchantName: string | null
      accountName: string
      accountNoMasked: string
      bankName: string
      bankBranch: string | null
      accountType: string
      minAmount: number
      isActive: boolean
      sortOrder: number
      createdAt: Date
    }>
    total: number
    page: number
    pageSize: number
  }
  merchants: MerchantOption[]
  initialMerchantId: string
  total: number
}

const EMPTY_FORM = {
  merchantId: '',
  accountName: '',
  accountNo: '',
  bankName: '',
  bankBranch: '',
  minAmount: '0',
  accountType: 'enterprise' as 'enterprise' | 'personal',
  remark: '',
}

export function ReceivingAccountPanel({ accounts, merchants, initialMerchantId, total }: Props) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM, merchantId: initialMerchantId })
  const [isPending, startTransition] = useTransition()

  const createMutation = trpc.merchant.receivingAccount.create.useMutation({
    onSuccess: () => {
      toast.success('专用收款账户已开通，商户端立即可见')
      setOpen(false)
      setForm({ ...EMPTY_FORM, merchantId: initialMerchantId })
      startTransition(() => {
        void utils.merchant.receivingAccount.invalidate()
        router.refresh()
      })
    },
    onError: (err: { message: string }) => toast.error(err.message),
  })

  const setActiveMutation = trpc.merchant.receivingAccount.setActive.useMutation({
    onSuccess: (_d: unknown, vars: { isActive: boolean }) => {
      toast.success(vars.isActive ? '已启用，商户端恢复可见' : '已停用，商户端不再下发')
      startTransition(() => {
        void utils.merchant.receivingAccount.invalidate()
        router.refresh()
      })
    },
    onError: (err: { message: string }) => toast.error(err.message),
  })

  const submit = () => {
    createMutation.mutate({
      merchantId: form.merchantId,
      accountName: form.accountName,
      accountNo: form.accountNo,
      bankName: form.bankName,
      bankBranch: form.bankBranch || null,
      accountType: form.accountType,
      minAmount: Number(form.minAmount) || 0,
      remark: form.remark || null,
    })
  }

  const selectedMerchant = merchants.find((m) => m.id === form.merchantId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">专用收款账户</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            商户预付（对公转账）的收款目标。商户只会看到分配给自己的账户。
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={merchants.length === 0}>
              开通专用账户
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>开通专用收款账户</DialogTitle>
              <DialogDescription>
                账户将只对该商户下发。开通后商户即可自助创建预付单并按此账户转账。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ra-merchant">商户</Label>
                <NativeSelect
                  id="ra-merchant"
                  value={form.merchantId}
                  onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
                >
                  <NativeSelectOption value="">请选择商户</NativeSelectOption>
                  {merchants.map((m) => (
                    <NativeSelectOption key={m.id} value={m.id}>
                      {m.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ra-account-name">账户户名</Label>
                  <Input
                    id="ra-account-name"
                    value={form.accountName}
                    onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                    placeholder="与银行开户名完全一致"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ra-account-no">银行账号</Label>
                  <Input
                    id="ra-account-no"
                    value={form.accountNo}
                    onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
                    placeholder="仅数字"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ra-bank">开户行</Label>
                  <Input
                    id="ra-bank"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    placeholder="如：招商银行"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ra-branch">支行（可选）</Label>
                  <Input
                    id="ra-branch"
                    value={form.bankBranch}
                    onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ra-type">账户类型</Label>
                  <NativeSelect
                    id="ra-type"
                    value={form.accountType}
                    onChange={(e) =>
                      setForm({ ...form, accountType: e.target.value as 'enterprise' | 'personal' })
                    }
                  >
                    <NativeSelectOption value="enterprise">对公</NativeSelectOption>
                    <NativeSelectOption value="personal">个人</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ra-min">最低汇款额（元）</Label>
                  <Input
                    id="ra-min"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.minAmount}
                    onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="ra-remark">备注</Label>
                <Textarea
                  id="ra-remark"
                  rows={2}
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  placeholder="如：该商户走 XX 分行对公户"
                />
              </div>

              {selectedMerchant ? (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                  <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    开通后「{selectedMerchant.name}
                    」的预付表单只会显示这个账户。同一账户若出现在多个商户的预付单里，
                    汇款备注与到账流水将无法唯一归属，串号后无法自动对账 —— 请勿复用账户。
                  </span>
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                onClick={submit}
                disabled={
                  createMutation.isPending ||
                  !form.merchantId ||
                  !form.accountName ||
                  !form.accountNo ||
                  !form.bankName
                }
              >
                {createMutation.isPending ? '开通中…' : '确认开通'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {merchants.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无商户，请先完成商户审核。</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商户</TableHead>
                <TableHead>户名</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>开户行</TableHead>
                <TableHead className="text-right">最低额</TableHead>
                <TableHead className="text-right">顺序</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                    尚未配置专用收款账户
                  </TableCell>
                </TableRow>
              ) : (
                accounts.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.merchantName ?? a.merchantId}</TableCell>
                    <TableCell>{a.accountName}</TableCell>
                    <TableCell className="font-mono text-xs">{a.accountNoMasked}</TableCell>
                    <TableCell>{a.bankName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.minAmount > 0 ? `¥${a.minAmount.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.sortOrder}</TableCell>
                    <TableCell>
                      {a.isActive ? (
                        <Badge variant="default">启用</Badge>
                      ) : (
                        <Badge variant="secondary">已停用</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={a.isActive ? 'outline' : 'default'}
                        disabled={setActiveMutation.isPending}
                        onClick={() =>
                          setActiveMutation.mutate({ id: a.id, isActive: !a.isActive })
                        }
                      >
                        {a.isActive ? '停用' : '启用'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ListPagination
        page={accounts.page}
        pageSize={accounts.pageSize}
        totalPages={Math.max(1, Math.ceil(total / accounts.pageSize))}
        totalItems={total}
        onPageChange={(p) => {
          const params = new URLSearchParams()
          params.set('page', String(p))
          if (initialMerchantId) params.set('merchantId', initialMerchantId)
          router.push(`?${params.toString()}`)
        }}
      />
    </div>
  )
}
