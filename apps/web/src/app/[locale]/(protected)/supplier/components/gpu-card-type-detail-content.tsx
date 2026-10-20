'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Separator } from '@workspace/ui/components/separator'
import { manufacturerNames } from '@/lib/data/types'
import { canManageSupply } from '@/lib/auth/app-role'
import { authClient } from '@/lib/auth-client'
import { buildGpuCardTypeDatacenterDetailMarkdown, buildGpuCardTypeDetailMarkdown } from '@/lib/supplier/gpu-card-type-detail-markdown'
import { trpc } from '@/lib/trpc/client'

const dcStatusNames: Record<string, string> = {
  online: '在线',
  offline: '离线',
  maintenance: '维护中',
}

const deviceRoleLabels: Record<string, string> = {
  compute: 'GPU',
  infra: 'CPU',
  wr_placeholder: '整租占位',
}

const CARD_HOUR_PRODUCT_LINES = new Set([
  'elastic_service',
  'cloud_vm',
  'job',
  'spot',
])

function PriceSourceBadge({
  source,
  sourceLabel,
}: {
  source: 'datacenter' | 'platform_fallback' | 'unset'
  sourceLabel: string
}) {
  return (
    <Badge
      variant="outline"
      className={
        source === 'datacenter'
          ? 'bg-green-500/10 text-green-400 border-green-500/30'
          : source === 'platform_fallback'
            ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
            : ''
      }
    >
      {sourceLabel}
    </Badge>
  )
}

type GpuCardTypeDetailContentProps = {
  cardTypeId: string
}

function SummarySection({
  title,
  lines,
  emptyText,
}: {
  title: string
  lines: string[]
  emptyText: string
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {lines.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/20 p-3 text-sm text-foreground">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border px-4 py-4 text-center">
          {emptyText}
        </p>
      )}
    </div>
  )
}

export function GpuCardTypeDetailContent({ cardTypeId }: GpuCardTypeDetailContentProps) {
  const utils = trpc.useUtils()
  const { data: session } = authClient.useSession()
  const canManage = canManageSupply(session?.user?.role)
  const [isCopying, setIsCopying] = useState(false)
  const [isDcCopying, setIsDcCopying] = useState(false)

  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.supplier.gpuCardTypes.getDetailPage.useQuery({ id: cardTypeId })

  const [selectedDcId, setSelectedDcId] = useState<string | null>(null)
  const dialogOpen = selectedDcId != null

  const {
    data: dcDetail,
    isLoading: dcLoading,
    isError: dcError,
    error: dcErrorObj,
  } = trpc.supplier.gpuCardTypes.getDatacenterDetail.useQuery(
    { cardTypeId, dataCenterId: selectedDcId ?? '' },
    { enabled: dialogOpen && Boolean(selectedDcId) },
  )

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
    )
  }

  if (isError || !detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2 px-0" asChild>
          <Link href="/supplier/gpu-card-types">
            <ArrowLeft className="size-4" />
            返回系统卡型
          </Link>
        </Button>
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="text-destructive">{error?.message || '加载卡型详情失败'}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      </div>
    )
  }

  const { card, listPrices, datacenters } = detail
  const cardHourListPrices = listPrices.filter(
    (row) => CARD_HOUR_PRODUCT_LINES.has(row.productLine) && row.billingUnit === 'hour',
  )
  const bareMetalListPrices = listPrices.filter((row) => row.productLine === 'bare_metal')
  const unitLabel = card.deviceRole === 'infra' ? '台' : '卡'
  const roleLabel = deviceRoleLabels[card.deviceRole ?? 'compute'] ?? 'GPU'

  const handleCopyMarkdown = async () => {
    setIsCopying(true)
    try {
      const datacenterDetails =
        datacenters.length > 0
          ? await Promise.all(
              datacenters.map((dc) =>
                utils.supplier.gpuCardTypes.getDatacenterDetail.fetch({
                  cardTypeId,
                  dataCenterId: dc.dataCenterId,
                }),
              ),
            )
          : []
      const markdown = buildGpuCardTypeDetailMarkdown(detail, datacenterDetails)
      await navigator.clipboard.writeText(markdown)
      toast.success('已复制 Markdown 到剪贴板')
    } catch {
      toast.error('复制失败，请稍后重试')
    } finally {
      setIsCopying(false)
    }
  }

  const handleCopyDcMarkdown = async () => {
    if (!dcDetail) return
    setIsDcCopying(true)
    try {
      const markdown = buildGpuCardTypeDatacenterDetailMarkdown(dcDetail)
      await navigator.clipboard.writeText(markdown)
      toast.success('已复制机房 Markdown 到剪贴板')
    } catch {
      toast.error('复制失败，请稍后重试')
    } finally {
      setIsDcCopying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 flex flex-row items-center gap-2">
          <Button variant="ghost" className="gap-2 px-0 h-auto p-2" asChild>
            <Link href="/supplier/gpu-card-types">
              <ArrowLeft className="size-4" />
              返回系统卡型
            </Link>
          </Button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{card.name}</h1>
              <Badge variant="outline">{roleLabel}</Badge>
              <Badge
                variant="outline"
                className={
                  card.status === 'active'
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                }
              >
                {card.status === 'active' ? '启用' : '已禁用'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              编码 <code className="text-xs">{card.code ?? card.id}</code>
              {' · '}
              {manufacturerNames[card.manufacturer] ?? card.manufacturer}
              {' · '}
              {card.memoryGB} GB
              {card.tdpWatts != null ? ` · ${card.tdpWatts} W` : ''}
              {card.computeCapability ? ` · 算力 ${card.computeCapability}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleCopyMarkdown()}
            disabled={isCopying}
          >
            <Copy className="size-4" />
            {isCopying ? '复制中…' : '复制 Markdown'}
          </Button>
          {canManage ? (
            <Button variant="outline" className="gap-2" asChild>
              <Link href={`/supplier/platform-pricing/${card.id}`}>
                平台定价
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前生效平台刊例价</CardTitle>
          <CardDescription>
            卡时价与裸金属各租期；编辑请前往平台定价页
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">卡时价</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>产品线</TableHead>
                  <TableHead>计费单位</TableHead>
                  <TableHead>销售单价</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cardHourListPrices.map((row) => (
                  <TableRow key={`${row.productLine}:${row.billingUnit}`}>
                    <TableCell>{row.productLineLabel}</TableCell>
                    <TableCell>{row.billingUnitLabel}</TableCell>
                    <TableCell>
                      {row.sellPrice != null ? (
                        <span className="font-semibold">¥{row.sellPrice.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">未配置</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.status === 'active' ? '生效中' : row.sellPrice != null ? row.status : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">裸金属</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>租期</TableHead>
                  <TableHead>销售单价</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bareMetalListPrices.map((row) => (
                  <TableRow key={`${row.productLine}:${row.billingUnit}`}>
                    <TableCell>{row.billingUnitLabel}</TableCell>
                    <TableCell>
                      {row.sellPrice != null ? (
                        <span className="font-semibold">¥{row.sellPrice.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">未配置</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.status === 'active' ? '生效中' : row.sellPrice != null ? row.status : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">机房列表</CardTitle>
          <CardDescription>
            设备数量 / 可用数量取自 L1 库存聚合（单位：{unitLabel}）；点击行查看设备配置、机房基础设施与卡时价 / 裸金属定价
          </CardDescription>
        </CardHeader>
        <CardContent>
          {datacenters.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无库存大于 0 的机房
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>机房</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>位置</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>设备数（{unitLabel}）</TableHead>
                  <TableHead>可用数（{unitLabel}）</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datacenters.map((dc) => (
                  <TableRow
                    key={dc.dataCenterId}
                    className="cursor-pointer"
                    onClick={() => setSelectedDcId(dc.dataCenterId)}
                  >
                    <TableCell className="font-medium text-primary">{dc.dataCenterName}</TableCell>
                    <TableCell>{dc.supplierName}</TableCell>
                    <TableCell className="text-muted-foreground">{dc.location || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {dcStatusNames[dc.dcStatus] ?? dc.dcStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{dc.deviceCount}</TableCell>
                    <TableCell>{dc.availableCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedDcId(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dcDetail?.dataCenterName ?? '机房详情'}</DialogTitle>
            <DialogDescription>
              {dcDetail
                ? `${dcDetail.supplierName} · ${dcDetail.cardTypeName}`
                : '加载机房配置与卡时价 / 裸金属定价'}
            </DialogDescription>
          </DialogHeader>

          {dcLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
          ) : dcError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {dcErrorObj?.message || '加载失败'}
            </p>
          ) : dcDetail ? (
            <div className="space-y-6 py-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">设备配置（机房 × 卡型）</h3>
                  {canManage ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/supplier/datacenters/${dcDetail.dataCenterId}`}>
                        前往机房详情
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {dcDetail.deviceSpec.hasAny ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/20 p-4">
                    {dcDetail.deviceSpec.lines.map((line) => (
                      <p key={line} className="text-sm text-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border px-4 py-6 text-center">
                    尚未维护设备配置，请在机房详情「卡型成本」中点击「更新配置」
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">机房基础设施</h3>
                  {canManage ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/supplier/datacenters/${dcDetail.dataCenterId}`}>
                        编辑带宽 / 网络 / 存储
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {dcDetail.infrastructure.hasAny ? (
                  <div className="space-y-4">
                    <SummarySection
                      title="带宽"
                      lines={dcDetail.infrastructure.bandwidthLines}
                      emptyText="尚未配置带宽"
                    />
                    <SummarySection
                      title="网络"
                      lines={dcDetail.infrastructure.networkLines}
                      emptyText="尚未配置网络"
                    />
                    <SummarySection
                      title="存储"
                      lines={dcDetail.infrastructure.storageLines}
                      emptyText="尚未配置存储"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border px-4 py-6 text-center">
                    尚未维护机房基础设施，请在机房详情页「带宽 / 网络 / 存储」卡片中配置
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">卡时价</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>产品线</TableHead>
                      <TableHead>销售单价</TableHead>
                      <TableHead>价格来源</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dcDetail.cardHourPrices.map((row) => (
                      <TableRow key={row.productLine}>
                        <TableCell>{row.productLineLabel}</TableCell>
                        <TableCell>
                          {row.sellPrice != null ? (
                            <span className="font-semibold">¥{row.sellPrice.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">未配置</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <PriceSourceBadge source={row.source} sourceLabel={row.sourceLabel} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">裸金属定价</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>租期</TableHead>
                      <TableHead>销售单价</TableHead>
                      <TableHead>价格来源</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dcDetail.bareMetalPrices.map((row) => (
                      <TableRow key={row.billingUnit}>
                        <TableCell>{row.billingUnitLabel}</TableCell>
                        <TableCell>
                          {row.sellPrice != null ? (
                            <span className="font-semibold">¥{row.sellPrice.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">未配置</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <PriceSourceBadge source={row.source} sourceLabel={row.sourceLabel} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void handleCopyDcMarkdown()}
              disabled={!dcDetail || dcLoading || isDcCopying}
            >
              <Copy className="size-4" />
              {isDcCopying ? '复制中…' : '复制 Markdown'}
            </Button>
            <Button variant="outline" onClick={() => setSelectedDcId(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
