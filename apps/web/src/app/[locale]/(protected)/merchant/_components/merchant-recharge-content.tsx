'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import type {
  MerchantPaymentNode,
  MerchantPaymentNodeAuditLog,
  MerchantRechargeAuditLog,
  MerchantRechargeRecord,
} from '@/lib/types/merchant'
import { MerchantDetailNav } from './merchant-detail-nav'
import {
  MerchantPaymentNodeDialog,
  type MerchantPaymentNodeFormInput,
} from './merchant-payment-node-dialog'
import {
  MerchantRechargeDialog,
  type MerchantRechargeFormInput,
} from './merchant-recharge-dialog'
import { isImageAttachment } from './merchant-recharge-voucher-upload'
import {
  formatMoney,
  merchantRechargeSourceLabels,
  merchantRechargeStatusLabels,
  PAYMENT_NODE_PROGRESS_BADGE,
  paymentNodeProgressLabels,
  RECHARGE_STATUS_BADGE,
} from './merchant-utils'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { cn } from '@workspace/ui/lib/utils'

export function MerchantRechargeContent({ merchantId }: { merchantId: string }) {
  const utils = trpc.useUtils()
  const merchantQuery = trpc.merchant.getById.useQuery({ id: merchantId })
  /**
   * D4-6=B：回款节点保留催款语义，只对佣金模式有意义；
   * 预付模式方向相反（商户已先付款），整块不展示也不发请求。
   */
  const showPaymentNodes =
    (merchantQuery.data?.fundingMode ?? 'prepay') === 'commission'
  const nodesQuery = trpc.merchant.paymentNode.list.useQuery(
    { merchantId },
    { enabled: showPaymentNodes },
  )
  const recordsQuery = trpc.merchant.recharge.list.useQuery({ merchantId })
  const nodeAuditQuery = trpc.merchant.paymentNode.auditList.useQuery(
    { merchantId, limit: 10 },
    { enabled: showPaymentNodes },
  )
  const rechargeAuditQuery = trpc.merchant.recharge.auditList.useQuery({ merchantId, limit: 10 })

  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set())
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false)
  const [nodeDialogMode, setNodeDialogMode] = useState<'create' | 'edit'>('create')
  const [editingNode, setEditingNode] = useState<MerchantPaymentNode | undefined>()
  const [rechargeDialogOpen, setRechargeDialogOpen] = useState(false)
  const [rechargeDialogMode, setRechargeDialogMode] = useState<'create' | 'edit'>('create')
  const [editingRecord, setEditingRecord] = useState<MerchantRechargeRecord | undefined>()
  const [rechargeNodeContext, setRechargeNodeContext] = useState<
    {
      id: string
      name: string
      billMonth?: string
    } | undefined
  >()
  const [nodeAuditOpen, setNodeAuditOpen] = useState(false)
  const [nodeAuditTarget, setNodeAuditTarget] = useState<MerchantPaymentNode | undefined>()
  const [rechargeAuditOpen, setRechargeAuditOpen] = useState(false)
  const [rechargeAuditTarget, setRechargeAuditTarget] = useState<MerchantRechargeRecord | undefined>()
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [voucherRecord, setVoucherRecord] = useState<MerchantRechargeRecord | undefined>()

  const invalidateAll = async () => {
    await Promise.all([
      utils.merchant.paymentNode.list.invalidate({ merchantId }),
      utils.merchant.recharge.list.invalidate({ merchantId }),
      utils.merchant.paymentNode.auditList.invalidate({ merchantId }),
      utils.merchant.recharge.auditList.invalidate({ merchantId }),
      utils.merchant.activity.list.invalidate({ merchantId }),
    ])
  }

  const createNodeMutation = trpc.merchant.paymentNode.create.useMutation({
    onSuccess: async () => {
      toast.success('回款节点已创建')
      await invalidateAll()
    },
    onError: (err) => toast.error(err.message || '创建失败'),
  })

  const updateNodeMutation = trpc.merchant.paymentNode.update.useMutation({
    onSuccess: async () => {
      toast.success('回款节点已更新')
      await invalidateAll()
    },
    onError: (err) => toast.error(err.message || '更新失败'),
  })

  const cancelNodeMutation = trpc.merchant.paymentNode.cancel.useMutation({
    onSuccess: async () => {
      toast.success('回款节点已作废')
      await invalidateAll()
    },
    onError: (err) => toast.error(err.message || '作废失败'),
  })

  const createRechargeMutation = trpc.merchant.recharge.create.useMutation({
    onSuccess: async () => {
      toast.success('回款记录已创建')
      await invalidateAll()
    },
    onError: (err) => toast.error(err.message || '创建失败'),
  })

  const updateRechargeMutation = trpc.merchant.recharge.update.useMutation({
    onSuccess: async () => {
      toast.success('回款记录已更新')
      await invalidateAll()
    },
    onError: (err) => toast.error(err.message || '更新失败'),
  })

  const nodeAuditDetailQuery = trpc.merchant.paymentNode.auditList.useQuery(
    { paymentNodeId: nodeAuditTarget?.id ?? '' },
    { enabled: nodeAuditOpen && Boolean(nodeAuditTarget?.id) },
  )

  const rechargeAuditDetailQuery = trpc.merchant.recharge.auditList.useQuery(
    { rechargeId: rechargeAuditTarget?.id ?? '' },
    { enabled: rechargeAuditOpen && Boolean(rechargeAuditTarget?.id) },
  )

  const nodes = nodesQuery.data ?? []
  const records = recordsQuery.data ?? []

  const recordsByNode = useMemo(() => {
    const map = new Map<string, MerchantRechargeRecord[]>()
    const unassigned: MerchantRechargeRecord[] = []
    for (const record of records) {
      if (record.paymentNodeId) {
        const list = map.get(record.paymentNodeId) ?? []
        list.push(record)
        map.set(record.paymentNodeId, list)
      } else {
        unassigned.push(record)
      }
    }
    return { map, unassigned }
  }, [records])

  const stats = useMemo(() => {
    const completed = records.filter((r) => r.status === 'completed')
    const expectedTotal = nodes.reduce((s, n) => s + n.expectedAmount, 0)
    const collectedTotal = nodes.reduce((s, n) => s + n.collectedAmount, 0)
    return {
      nodeCount: nodes.length,
      expectedTotal,
      collectedTotal,
      completedAmount: completed.reduce((s, r) => s + r.amount, 0),
      pendingCount: records.filter((r) => r.status === 'pending').length,
    }
  }, [nodes, records])

  if (merchantQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        加载中…
      </div>
    )
  }

  const merchant = merchantQuery.data
  if (!merchant) {
    return <p className="text-muted-foreground">商户不存在</p>
  }

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const openCreateNode = () => {
    setNodeDialogMode('create')
    setEditingNode(undefined)
    setNodeDialogOpen(true)
  }

  const openEditNode = (node: MerchantPaymentNode) => {
    setNodeDialogMode('edit')
    setEditingNode(node)
    setNodeDialogOpen(true)
  }

  const openCreateRecharge = (node?: MerchantPaymentNode) => {
    setRechargeDialogMode('create')
    setEditingRecord(undefined)
    setRechargeNodeContext(
      node
        ? {
            id: node.id,
            name: node.name,
            billMonth: node.billMonth,
          }
        : undefined,
    )
    setRechargeDialogOpen(true)
  }

  const openEditRecharge = (record: MerchantRechargeRecord) => {
    if (record.source === 'platform_sync') {
      toast.info('平台同步记录仅可修改备注与状态')
    }
    setRechargeDialogMode('edit')
    setEditingRecord(record)
    const node = record.paymentNodeId
      ? nodes.find((n) => n.id === record.paymentNodeId)
      : undefined
    setRechargeNodeContext(
      node
        ? {
            id: node.id,
            name: node.name,
            billMonth: node.billMonth,
          }
        : undefined,
    )
    setRechargeDialogOpen(true)
  }

  const handleNodeSubmit = async (input: MerchantPaymentNodeFormInput) => {
    if (nodeDialogMode === 'create') {
      await createNodeMutation.mutateAsync({ merchantId, ...input })
    } else if (editingNode) {
      await updateNodeMutation.mutateAsync({ paymentNodeId: editingNode.id, ...input })
    }
  }

  const handleRechargeSubmit = async (input: MerchantRechargeFormInput) => {
    if (rechargeDialogMode === 'create') {
      await createRechargeMutation.mutateAsync({
        merchantId,
        paymentNodeId: rechargeNodeContext?.id,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        status: input.status,
        transactionId: input.transactionId,
        rechargeDate: input.rechargeDate,
        remark: input.remark,
        billMonth: input.billMonth,
        files: input.files,
      })
    } else if (editingRecord) {
      await updateRechargeMutation.mutateAsync({
        rechargeId: editingRecord.id,
        paymentNodeId: rechargeNodeContext?.id ?? editingRecord.paymentNodeId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        status: input.status,
        transactionId: input.transactionId,
        rechargeDate: input.rechargeDate,
        remark: input.remark,
        billMonth: input.billMonth,
        keepAttachmentIds: input.keepAttachmentIds,
        files: input.files,
      })
    }
  }

  const handleCancelNode = async (node: MerchantPaymentNode) => {
    if (!window.confirm(`确定作废回款节点「${node.name}」？`)) return
    await cancelNodeMutation.mutateAsync({ paymentNodeId: node.id })
  }

  return (
    <div className="space-y-6">
      <MerchantDetailNav merchant={merchant} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {showPaymentNodes
            ? '线上自助充值为主、运营手工登记为例外；回款节点与记录的创建、修改均写入审计日志。'
            : '线上自助充值为主、运营手工登记为例外；记录的创建、修改均写入审计日志。'}
        </p>
        {showPaymentNodes ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={openCreateNode}>
              <Plus className="size-4" />
              新增节点
            </Button>
          </div>
        ) : null}
      </div>

      {showPaymentNodes ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">回款节点</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{stats.nodeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">计划回款总额</p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              ¥{formatMoney(stats.expectedTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">节点已回款</p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              ¥{formatMoney(stats.collectedTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">待支付记录</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{stats.pendingCount}</p>
          </CardContent>
        </Card>
      </div>
      ) : null}

      {showPaymentNodes ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">回款节点</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {nodesQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
          ) : nodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无回款节点，请先创建节点再录入回款记录
            </p>
          ) : (
            <div className="divide-y divide-border">
              {nodes.map((node) => {
                const expanded = expandedNodeIds.has(node.id)
                const nodeRecords = recordsByNode.map.get(node.id) ?? []
                const progressPercent =
                  node.expectedAmount > 0
                    ? Math.min(100, Math.round((node.collectedAmount / node.expectedAmount) * 100))
                    : 0

                return (
                  <div key={node.id}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-left"
                        onClick={() => toggleNodeExpanded(node.id)}
                      >
                        {expanded ? (
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-medium">{node.name}</span>
                      </button>
                      <Badge variant="outline" className={PAYMENT_NODE_PROGRESS_BADGE[node.progress]}>
                        {paymentNodeProgressLabels[node.progress]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        计划 ¥{formatMoney(node.expectedAmount)} · 到期 {node.dueDate}
                      </span>
                      <span className="text-sm tabular-nums">
                        已回 ¥{formatMoney(node.collectedAmount)}（{progressPercent}%）
                      </span>
                      <span className="text-xs text-muted-foreground">{node.recordCount} 条记录</span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => openCreateRecharge(node)}
                        >
                          <Plus className="size-3.5" />
                          添加回款
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEditNode(node)}
                          title="编辑节点"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setNodeAuditTarget(node)
                            setNodeAuditOpen(true)
                          }}
                          title="节点审计"
                        >
                          <History className="size-3.5" />
                        </Button>
                        {node.recordCount === 0 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => handleCancelNode(node)}
                            title="作废节点"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <div className="border-t border-border bg-muted/20 px-4 py-3">
                        {node.remark ? (
                          <p className="mb-3 text-xs text-muted-foreground">备注：{node.remark}</p>
                        ) : null}
                        <RechargeRecordsTable
                          records={nodeRecords}
                          onEdit={openEditRecharge}
                          onAudit={(record) => {
                            setRechargeAuditTarget(record)
                            setRechargeAuditOpen(true)
                          }}
                          onVoucher={(record) => {
                            setVoucherRecord(record)
                            setVoucherOpen(true)
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">未归属节点的回款记录</CardTitle>
            <p className="text-xs text-muted-foreground">
              不关联回款节点的独立回款记录，适用于历史数据或临时录入
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => openCreateRecharge()}>
            <Plus className="size-4" />
            新增回款
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <RechargeRecordsTable
            records={recordsByNode.unassigned}
            onEdit={openEditRecharge}
            onAudit={(record) => {
              setRechargeAuditTarget(record)
              setRechargeAuditOpen(true)
            }}
            onVoucher={(record) => {
              setVoucherRecord(record)
              setVoucherOpen(true)
            }}
          />
        </CardContent>
      </Card>

      {(nodeAuditQuery.data?.length ?? 0) > 0 || (rechargeAuditQuery.data?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">最近操作审计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...(nodeAuditQuery.data ?? []), ...(rechargeAuditQuery.data ?? [])]
              .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
              .slice(0, 8)
              .map((log) =>
                'paymentNodeId' in log ? (
                  <NodeAuditLogItem key={log.id} log={log} />
                ) : (
                  <RechargeAuditLogItem key={log.id} log={log} />
                ),
              )}
          </CardContent>
        </Card>
      ) : null}

      <MerchantPaymentNodeDialog
        open={nodeDialogOpen}
        onOpenChange={setNodeDialogOpen}
        mode={nodeDialogMode}
        merchantId={merchantId}
        node={editingNode}
        onSubmit={handleNodeSubmit}
      />

      <MerchantRechargeDialog
        open={rechargeDialogOpen}
        onOpenChange={setRechargeDialogOpen}
        mode={rechargeDialogMode}
        merchantId={merchantId}
        record={editingRecord}
        paymentNodeId={rechargeNodeContext?.id}
        paymentNodeName={rechargeNodeContext?.name}
        defaultBillMonth={
          rechargeDialogMode === 'create' ? rechargeNodeContext?.billMonth : undefined
        }
        onSubmit={handleRechargeSubmit}
      />

      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>回款凭证</DialogTitle>
          </DialogHeader>
          {voucherRecord ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {voucherRecord.rechargeDate} · ¥{formatMoney(voucherRecord.amount)} · 共{' '}
                {voucherRecord.attachments.length} 个文件
              </p>
              <div className="grid gap-3">
                {voucherRecord.attachments.map((att) => (
                  <div key={att.id} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                      <span className="truncate text-sm font-medium">{att.name}</span>
                      <Button variant="ghost" size="sm" className="shrink-0 gap-1 h-7" asChild>
                        <a href={att.dataUrl} download={att.name} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-3.5" />
                          下载
                        </a>
                      </Button>
                    </div>
                    {isImageAttachment(att.mimeType) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="max-h-64 w-full object-contain bg-muted/20"
                      />
                    ) : (
                      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                        PDF 文件，请点击下载查看
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={nodeAuditOpen} onOpenChange={setNodeAuditOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>回款节点审计</DialogTitle>
          </DialogHeader>
          {nodeAuditTarget ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {nodeAuditTarget.name} · 计划 ¥{formatMoney(nodeAuditTarget.expectedAmount)} ·{' '}
                {nodeAuditTarget.dueDate}
              </p>
              {nodeAuditDetailQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">加载中…</p>
              ) : (nodeAuditDetailQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无审计记录</p>
              ) : (
                <ul className="space-y-3">
                  {(nodeAuditDetailQuery.data ?? []).map((log) => (
                    <li key={log.id} className="rounded-md border border-border p-3">
                      <NodeAuditLogItem log={log} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rechargeAuditOpen} onOpenChange={setRechargeAuditOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>回款记录审计</DialogTitle>
          </DialogHeader>
          {rechargeAuditTarget ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {rechargeAuditTarget.rechargeDate} · ¥{formatMoney(rechargeAuditTarget.amount)} ·{' '}
                {rechargeAuditTarget.transactionId ?? '无流水号'}
              </p>
              {rechargeAuditDetailQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">加载中…</p>
              ) : (rechargeAuditDetailQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无审计记录</p>
              ) : (
                <ul className="space-y-3">
                  {(rechargeAuditDetailQuery.data ?? []).map((log) => (
                    <li key={log.id} className="rounded-md border border-border p-3">
                      <RechargeAuditLogItem log={log} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RechargeRecordsTable({
  records,
  onEdit,
  onAudit,
  onVoucher,
}: {
  records: MerchantRechargeRecord[]
  onEdit: (record: MerchantRechargeRecord) => void
  onAudit: (record: MerchantRechargeRecord) => void
  onVoucher: (record: MerchantRechargeRecord) => void
}) {
  if (records.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">暂无回款记录</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>回款日期</TableHead>
          <TableHead className="text-right">金额</TableHead>
          <TableHead>支付方式</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>来源</TableHead>
          <TableHead>凭证</TableHead>
          <TableHead>流水号</TableHead>
          <TableHead>操作人</TableHead>
          <TableHead className="w-[88px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => (
          <TableRow key={record.id}>
            <TableCell>{record.rechargeDate}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              ¥{formatMoney(record.amount)}
            </TableCell>
            <TableCell>{record.paymentMethod}</TableCell>
            <TableCell>
              <Badge variant="outline" className={RECHARGE_STATUS_BADGE[record.status]}>
                {merchantRechargeStatusLabels[record.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {merchantRechargeSourceLabels[record.source]}
            </TableCell>
            <TableCell>
              {record.attachments.length > 0 ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => onVoucher(record)}
                >
                  {record.attachments.length} 个文件
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs">{record.transactionId ?? '—'}</TableCell>
            <TableCell className="text-sm">{record.updatedBy ?? record.createdBy ?? '—'}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onEdit(record)}
                  title="编辑"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onAudit(record)}
                  title="审计记录"
                >
                  <History className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function NodeAuditLogItem({ log }: { log: MerchantPaymentNodeAuditLog }) {
  const actionLabel =
    log.action === 'create' ? '创建' : log.action === 'update' ? '修改' : '作废'
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          节点 · {actionLabel}
        </Badge>
        <span className="font-medium">{log.operatorName}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(log.occurredAt).toLocaleString('zh-CN')}
        </span>
      </div>
      {log.remark ? <p className="mt-1 text-muted-foreground">{log.remark}</p> : null}
      {log.changes ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {Object.entries(log.changes).map(([field, { from, to }]) => (
            <li key={field}>
              <span className="font-mono">{field}</span>：{String(from)} → {String(to)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function RechargeAuditLogItem({ log }: { log: MerchantRechargeAuditLog }) {
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px]')}>
          记录 · {log.action === 'create' ? '创建' : '修改'}
        </Badge>
        <span className="font-medium">{log.operatorName}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(log.occurredAt).toLocaleString('zh-CN')}
        </span>
      </div>
      {log.remark ? <p className="mt-1 text-muted-foreground">{log.remark}</p> : null}
      {log.changes ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {Object.entries(log.changes).map(([field, { from, to }]) => (
            <li key={field}>
              <span className="font-mono">{field}</span>：{String(from)} → {String(to)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
