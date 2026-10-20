'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ListPagination } from '@/components/shared/list-pagination'
import { AlertTriangleIcon, ExternalLinkIcon } from 'lucide-react'

/**
 * 对公转账凭证核销工作台
 *
 * 这里是商户 cash 池余额唯一的运营入口。`approve` 会经由
 * `handleMerchantPrepayCallback`（与渠道回调同一路径）入账，幂等由订单 id 保证。
 *
 * 金额不一致的行用醒目标记 + 「只看不一致」筛选单独拎出来：这类凭证**不能**
 * 一键通过，必须人工核对银行流水后走补汇/退款，系统不会替运营决定收还是退。
 */

interface ProofItem {
  id: string
  orderNo: string
  merchantName: string | null
  merchantId: string
  remitterName: string
  remitterAccount: string | null
  orderAmount: number
  transferAmount: number
  amountConsistent: boolean
  bankSerialNo: string | null
  voucherImageUrl: string | null
  remark: string | null
  reviewStatus: string
  orderStatus: string
  createdAt: Date
}

interface Props {
  initial: {
    items: ProofItem[]
    total: number
    page: number
    pageSize: number
  }
  summary: { pending: number; mismatch: number }
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'cancelled'
  onlyMismatch: boolean
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待核销',
  approved: '已入账',
  rejected: '已驳回',
  cancelled: '已取消',
}

export function TransferProofPanel({ initial, summary, reviewStatus, onlyMismatch }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const utils = trpc.useUtils()
  const [isPending, startTransition] = useTransition()

  const refresh = () =>
    startTransition(() => {
      void utils.merchant.transferProof.invalidate()
      router.refresh()
    })

  const approve = trpc.merchant.transferProof.approve.useMutation({
    onSuccess: (d) => {
      toast.success(
        d.replay
          ? `单号 ${d.orderNo} 此前已入账，本次未重复加钱`
          : `已入账 ¥${d.credited.toFixed(2)} → 单号 ${d.orderNo}`,
      )
      refresh()
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })

  const reject = trpc.merchant.transferProof.reject.useMutation({
    onSuccess: () => {
      toast.success('已驳回，商户可重新提交凭证')
      refresh()
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })

  const setFilter = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    params.delete('page')
    router.push(`?${params.toString()}`)
  }

  const busy = approve.isPending || reject.isPending

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">转账凭证核销</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          商户提交到账凭证后，在这里核对银行流水并入账。当前待核销 {summary.pending} 笔
          {summary.mismatch > 0 ? `（其中 ${summary.mismatch} 笔金额不一致）` : ''}。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          value={reviewStatus}
          onChange={(e) => setFilter({ status: e.target.value })}
          className="w-40"
        >
          <NativeSelectOption value="pending">待核销</NativeSelectOption>
          <NativeSelectOption value="approved">已入账</NativeSelectOption>
          <NativeSelectOption value="rejected">已驳回</NativeSelectOption>
        </NativeSelect>

        <Button
          variant={onlyMismatch ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter({ mismatch: onlyMismatch ? '' : '1' })}
        >
          <AlertTriangleIcon className="size-3.5" />
          只看金额不一致
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商户</TableHead>
              <TableHead>充值单</TableHead>
              <TableHead>汇款方</TableHead>
              <TableHead className="text-right">订单金额</TableHead>
              <TableHead className="text-right">到账金额</TableHead>
              <TableHead>凭证</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                  暂无凭证
                </TableCell>
              </TableRow>
            ) : (
              initial.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.merchantName ?? p.merchantId}</TableCell>
                  <TableCell className="font-mono text-xs">{p.orderNo}</TableCell>
                  <TableCell className="text-sm">
                    <div>{p.remitterName}</div>
                    {p.remitterAccount ? (
                      <div className="text-muted-foreground font-mono text-xs">
                        {p.remitterAccount}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ¥{p.orderAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={p.amountConsistent ? '' : 'font-semibold text-red-600'}>
                      ¥{p.transferAmount.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.voucherImageUrl ? (
                      <a
                        href={p.voucherImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-xs underline"
                      >
                        查看 <ExternalLinkIcon className="size-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">无</span>
                    )}
                    {p.bankSerialNo ? (
                      <div className="text-muted-foreground font-mono text-xs">
                        {p.bankSerialNo}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.reviewStatus === 'approved' ? 'default' : 'secondary'}>
                      {STATUS_LABEL[p.reviewStatus] ?? p.reviewStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {p.reviewStatus === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy || !p.amountConsistent}
                          onClick={() => approve.mutate({ proofId: p.id })}
                        >
                          通过并入账
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => reject.mutate({ proofId: p.id })}
                        >
                          驳回
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">已处理</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ListPagination
        page={initial.page}
        pageSize={initial.pageSize}
        totalPages={Math.max(1, Math.ceil(initial.total / initial.pageSize))}
        totalItems={initial.total}
        onPageChange={(p) => {
          const params = new URLSearchParams(sp.toString())
          params.set('page', String(p))
          router.push(`?${params.toString()}`)
        }}
      />
    </div>
  )
}
