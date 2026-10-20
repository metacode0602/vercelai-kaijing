'use client'

import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ArrowLeft, Send, Trash2, Link2 } from 'lucide-react'
import { useState } from 'react'
import { ContractLinkDevicesDialog } from './contract-link-devices-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@workspace/ui/components/dialog'
import { Textarea } from '@workspace/ui/components/textarea'
import { Label } from '@workspace/ui/components/label'
import { ContractEditDialog } from './contract-edit-dialog'
import {
  SITE_NODE_TIERS,
  PRODUCT_LINE_OPTIONS,
  downloadSiteBomXlsx,
} from '@/lib/supplier/contract-site-bom'
import { contractPricingModeLabel } from '@/lib/data/types'

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '待确认',
  active: '生效中',
  rejected: '已拒绝',
  expired: '已过期',
  terminated: '已终止',
}

const statusColors: Record<string, string> = {
  draft: 'border-gray-300 text-gray-700',
  pending: 'border-yellow-300 text-yellow-700 bg-yellow-50',
  active: 'border-green-300 text-green-700 bg-green-50',
  rejected: 'border-red-300 text-red-700 bg-red-50',
}

const confirmationLabels: Record<string, string> = {
  none: '未发送',
  pending: '等待确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  modification_requested: '请求修改',
}

const typeLabels: Record<string, string> = {
  cooperation: '合作协议',
  supplement: '补充协议',
  renewal: '续签协议',
}

const cooperationLabels: Record<string, string> = {
  idle_time: '闲时合作',
  whole_rent: '整租合作',
}

export function ContractDetailContent() {
  const params = useParams()
  const router = useRouter()
  const contractId = params.contractId as string

  const [showTerminate, setShowTerminate] = useState(false)
  const [terminateReason, setTerminateReason] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showLinkDevices, setShowLinkDevices] = useState(false)

  const { data, isLoading } = trpc.supplier.contract.getById.useQuery({ contractId })
  const { data: linkedDevices } = trpc.supplier.contract.listLinkedDevices.useQuery(
    { contractId, page: 1, pageSize: 20 },
    { enabled: !!contractId },
  )

  const utils = trpc.useUtils()

  const sendMutation = trpc.supplier.contract.sendToSupplier.useMutation({
    onSuccess: () => utils.supplier.contract.getById.invalidate({ contractId }),
  })

  const terminateMutation = trpc.supplier.contract.terminate.useMutation({
    onSuccess: () => {
      utils.supplier.contract.getById.invalidate({ contractId })
      setShowTerminate(false)
      setTerminateReason('')
    },
  })

  if (isLoading) {
    return <div className="text-center text-muted-foreground py-8">加载中...</div>
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-8">合同不存在</div>
  }

  const contract = data
  const capacityLines = data.capacityLines ?? []
  const totalDevices = capacityLines.reduce((s: number, l: any) => s + (l.deviceQuantity ?? 0), 0)
  const totalGpus = capacityLines.reduce((s: number, l: any) => s + (l.gpuQuantity ?? 0), 0)

  const canEdit = ['draft', 'rejected'].includes(contract.status)
  const canSend = canEdit && capacityLines.length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/supplier/contracts')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{contract.contractNo}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={statusColors[contract.status]}>
              {statusLabels[contract.status]}
            </Badge>
            <Badge variant="outline" className={statusColors[contract.supplierConfirmationStatus]}>
              {confirmationLabels[contract.supplierConfirmationStatus]}
            </Badge>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {canEdit && (
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            编辑
          </Button>
        )}
        {canSend && (
          <Button
            onClick={() => sendMutation.mutate({ contractId })}
            disabled={sendMutation.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            发送给供应商
          </Button>
        )}
        {contract.status === 'active' && (
          <>
            <Button variant="outline" onClick={() => setShowLinkDevices(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              关联设备
            </Button>
            <Button variant="destructive" onClick={() => setShowTerminate(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              终止合同
            </Button>
          </>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">供应商</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium">{contract.supplierName}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">产能摘要</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium">{totalDevices} 台设备，{totalGpus} 张 GPU</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">合同期限</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium">
              {contract.startDate} ~ {contract.endDate ?? '无固定期限'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">计价方式</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium">
              {contractPricingModeLabel(contract.pricingMode)}
              {contract.unitPricePerHour && ` ¥${contract.unitPricePerHour}/小时`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Info */}
      <Card>
        <CardHeader>
          <CardTitle>合同信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">合同类型：</span>
              {typeLabels[contract.type]}
            </div>
            <div>
              <span className="text-muted-foreground">合作模式：</span>
              {cooperationLabels[contract.cooperationMode]}
            </div>
            <div>
              <span className="text-muted-foreground">结算周期：</span>
              {contract.settlementCycle === 'monthly' ? '月结' : contract.settlementCycle === 'quarterly' ? '季结' : '-'}
            </div>
            <div>
              <span className="text-muted-foreground">签署人：</span>
              {contract.signerName ?? '-'}
            </div>
            {contract.terms && (
              <div className="col-span-2">
                <span className="text-muted-foreground">备注条款：</span>
                {contract.terms}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Site BOM */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>站点 BOM（GW-P0）</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadSiteBomXlsx({
                siteNodeTier: (contract as any).siteNodeTier ?? null,
                siteNodeCount: (contract as any).siteNodeCount ?? null,
                productLines: ((contract as any).productLines ?? []) as string[],
                publicIpCount: (contract as any).publicIpCount ?? null,
                supplierProvidesCpuHosts: (contract as any).supplierProvidesCpuHosts ?? true,
                contractNo: contract.contractNo,
                supplierName: contract.supplierName,
              })
            }
          >
            下载 BOM Excel
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">规模分档：</span>
              {SITE_NODE_TIERS.find((t) => t.value === (contract as any).siteNodeTier)?.label ??
                ((contract as any).siteNodeTier || '未设定')}
            </div>
            <div>
              <span className="text-muted-foreground">精确台数：</span>
              {(contract as any).siteNodeCount ?? '未设定'}
            </div>
            <div>
              <span className="text-muted-foreground">产品线：</span>
              {(((contract as any).productLines as string[] | undefined) ?? [])
                .map((v) => PRODUCT_LINE_OPTIONS.find((p) => p.value === v)?.label ?? v)
                .join('、') || '未设定'}
            </div>
            <div>
              <span className="text-muted-foreground">公网 IP：</span>
              {(contract as any).publicIpCount ?? '未设定'}
            </div>
            <div>
              <span className="text-muted-foreground">供应商提供 CPU 主机：</span>
              {(contract as any).supplierProvidesCpuHosts === false ? '否' : '是'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capacity Lines */}
      <Card>
        <CardHeader>
          <CardTitle>产能明细</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>机房</TableHead>
                <TableHead>GPU 卡型</TableHead>
                <TableHead>合作模式</TableHead>
                <TableHead>设备数</TableHead>
                <TableHead>GPU 数</TableHead>
                <TableHead>开始日期</TableHead>
                <TableHead>结束日期</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capacityLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    暂无产能明细
                  </TableCell>
                </TableRow>
              ) : (
                capacityLines.map((line: any) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.dataCenterName ?? line.dataCenterCode ?? line.dataCenterId}</TableCell>
                    <TableCell>{line.gpuCardTypeName ?? line.gpuCardTypeId}</TableCell>
                    <TableCell>{cooperationLabels[line.cooperationType] ?? line.cooperationType}</TableCell>
                    <TableCell>{line.deviceQuantity}</TableCell>
                    <TableCell>{line.gpuQuantity}</TableCell>
                    <TableCell>{line.startDate}</TableCell>
                    <TableCell>{line.endDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{line.lineStatus}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {capacityLines.length > 0 && (
            <div className="mt-3 text-sm text-muted-foreground text-right">
              汇总：共 {totalDevices} 台设备，{totalGpus} 张 GPU
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked devices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>已关联设备</CardTitle>
          {contract.status === 'active' && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowLinkDevices(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              手动关联
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SN</TableHead>
                <TableHead>机房</TableHead>
                <TableHead>卡型</TableHead>
                <TableHead>内网 IP</TableHead>
                <TableHead>运维状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(linkedDevices?.items?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    暂无关联设备（供应商建批提交后会自动写入；也可手动关联）
                  </TableCell>
                </TableRow>
              ) : (
                linkedDevices!.items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.sn}</TableCell>
                    <TableCell>{d.dataCenterName ?? '—'}</TableCell>
                    <TableCell>{d.cardTypeName ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{d.internalIp ?? '—'}</TableCell>
                    <TableCell>{d.opsStatus ?? d.lifecycleStatus ?? '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {(linkedDevices?.total ?? 0) > (linkedDevices?.items?.length ?? 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              仅展示前 {linkedDevices?.items?.length ?? 0} 台，共 {linkedDevices?.total} 台
            </p>
          )}
        </CardContent>
      </Card>

      <ContractEditDialog open={showEdit} onOpenChange={setShowEdit} contractId={contractId} />
      <ContractLinkDevicesDialog
        open={showLinkDevices}
        onOpenChange={setShowLinkDevices}
        contractId={contractId}
      />

      {/* Terminate Dialog */}
      <Dialog open={showTerminate} onOpenChange={setShowTerminate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>终止合同</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>终止原因 *</Label>
            <Textarea
              value={terminateReason}
              onChange={(e) => setTerminateReason(e.target.value)}
              placeholder="请输入终止原因..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerminate(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                terminateMutation.mutate({
                  contractId,
                  reason: terminateReason,
                })
              }
              disabled={!terminateReason || terminateMutation.isPending}
            >
              确认终止
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
