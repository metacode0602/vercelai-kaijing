'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

function formatTime(value: Date | string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

export default function ShopConflictsPage() {
  const utils = trpc.useUtils()
  const conflicts = trpc.platformOnboarding.listConflicts.useQuery()
  const [reasons, setReasons] = React.useState<Record<string, string>>({})
  const [notice, setNotice] = React.useState('')

  const invalidate = async () => {
    await utils.platformOnboarding.listConflicts.invalidate()
  }

  const uphold = trpc.platformOnboarding.upholdConflict.useMutation({
    onSuccess: async () => {
      setNotice('已维持原绑定。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const approveTransfer = trpc.platformOnboarding.approveTransfer.useMutation({
    onSuccess: async () => {
      setNotice('已批准转移。系统不会自动通知原租户，如需告知请自行联系。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const reviewAppeal = trpc.platformOnboarding.reviewAppeal.useMutation({
    onSuccess: async () => {
      setNotice('申诉复审已提交。系统不会自动发送通知。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const pending = uphold.isPending || approveTransfer.isPending || reviewAppeal.isPending

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">店铺绑定冲突</h2>
        <p className="text-sm text-muted-foreground">
          后来者授权会被当场拒绝，默认维持原绑定。转移须人工批准并填写原因；批准后原租户可在申诉窗口内申诉。历史订单、库存和结算留在原租户，不会迁移。系统不会自动通知原租户，如需告知请自行联系。
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>平台店铺</TableHead>
            <TableHead>后来者</TableHead>
            <TableHead>占用方</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>处理</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conflicts.isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : conflicts.data?.length ? (
            conflicts.data.map((conflict) => {
              const reason = reasons[conflict.id] ?? ''
              return (
                <TableRow key={conflict.id}>
                  <TableCell>
                    <div className="font-medium">
                      <Badge variant="outline">{conflict.platform}</Badge>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {conflict.externalShopId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      发起于 {formatTime(conflict.createdAt)}（Asia/Shanghai）
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{conflict.challengerOrganizationName}</div>
                    <div className="text-xs text-muted-foreground">{conflict.challengerShopName}</div>
                  </TableCell>
                  <TableCell>
                    <div>{conflict.occupantOrganizationName}</div>
                    <div className="text-xs text-muted-foreground">{conflict.occupantShopName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{conflict.statusLabel}</Badge>
                    {conflict.appealDeadlineAt ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        申诉截止 {formatTime(conflict.appealDeadlineAt)}（Asia/Shanghai）
                      </div>
                    ) : null}
                    {conflict.reviewReason ? (
                      <div className="mt-1 text-xs text-muted-foreground">原因：{conflict.reviewReason}</div>
                    ) : null}
                    {conflict.appealContent ? (
                      <div className="mt-1 text-xs text-muted-foreground">申诉：{conflict.appealContent}</div>
                    ) : null}
                    {conflict.appealReviewReason ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        复审：{conflict.appealReviewReason}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {conflict.status === 'pending' || conflict.status === 'appealed_pending_review' ? (
                      <div className="grid min-w-64 gap-2">
                        <Label htmlFor={`conflict-reason-${conflict.id}`}>处理原因</Label>
                        <Textarea
                          id={`conflict-reason-${conflict.id}`}
                          value={reason}
                          onChange={(event) =>
                            setReasons((current) => ({
                              ...current,
                              [conflict.id]: event.target.value,
                            }))
                          }
                          placeholder={
                            conflict.status === 'pending'
                              ? '批准转移必须填写核实原因。维持原绑定可填写备注。'
                              : '复审必须填写原因。'
                          }
                        />
                        {conflict.status === 'pending' ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm('确认维持原绑定并关闭后来者的这次申请？')) {
                                  uphold.mutate({
                                    conflictId: conflict.id,
                                    reason: reason.trim() || undefined,
                                  })
                                }
                              }}
                            >
                              维持原绑定
                            </Button>
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() => {
                                if (!reason.trim()) {
                                  setNotice('批准转移必须填写原因。')
                                  return
                                }
                                if (
                                  window.confirm(
                                    '确认批准转移？批准后将进入原租户申诉窗口（若窗口天数大于 0）。系统不会自动通知原租户。历史数据不会迁移。',
                                  )
                                ) {
                                  approveTransfer.mutate({
                                    conflictId: conflict.id,
                                    reason: reason.trim(),
                                  })
                                }
                              }}
                            >
                              批准转移
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => {
                                if (!reason.trim()) {
                                  setNotice('复审必须填写原因。')
                                  return
                                }
                                if (window.confirm('确认接受申诉并维持原绑定？')) {
                                  reviewAppeal.mutate({
                                    conflictId: conflict.id,
                                    decision: 'accept',
                                    reason: reason.trim(),
                                  })
                                }
                              }}
                            >
                              接受申诉
                            </Button>
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() => {
                                if (!reason.trim()) {
                                  setNotice('复审必须填写原因。')
                                  return
                                }
                                if (window.confirm('确认驳回申诉并释放名额？历史数据不会迁移。')) {
                                  reviewAppeal.mutate({
                                    conflictId: conflict.id,
                                    decision: 'reject',
                                    reason: reason.trim(),
                                  })
                                }
                              }}
                            >
                              驳回申诉
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {conflict.status === 'transfer_approved_pending_appeal'
                          ? '等待原租户申诉。系统不会自动通知，请自行判断是否联系。'
                          : conflict.status === 'released_pending_reauth'
                            ? '名额已释放，等待后来者重新授权。'
                            : '该冲突单已结案。'}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                暂无绑定冲突。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
