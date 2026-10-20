'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { MerchantPlatformDatacenter, MerchantRegionStatus } from '@/lib/types/merchant'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Textarea } from '@workspace/ui/components/textarea'
import { cn } from '@workspace/ui/lib/utils'

export type MerchantImportRegionRow = {
  key: string
  containerInstanceRegion: string
  dataCenterId: string | null
  dataCenterName: string
  regionName: string
  displayName: string
  effectiveFrom: string
  status: MerchantRegionStatus
  cpuQuotaInput: string
  matchStatus: 'matched' | 'not_found' | 'duplicate'
}

export type MerchantImportRegionsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  onImported?: (regionIds: string[]) => void | Promise<void>
}

function parseContainerInstanceRegions(raw: string): string[] {
  const tokens = raw
    .split(/[\n,;，；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(token)
  }
  return result
}

function findDatacenterByRegion(
  region: string,
  datacenters: readonly MerchantPlatformDatacenter[],
): MerchantPlatformDatacenter | undefined {
  const normalized = region.trim().toLowerCase()
  return datacenters.find(
    (dc) =>
      dc.regionCode.toLowerCase() === normalized ||
      dc.code.toLowerCase() === normalized ||
      dc.id.toLowerCase() === normalized,
  )
}

function buildImportRows(
  regions: string[],
  datacenters: readonly MerchantPlatformDatacenter[],
): MerchantImportRegionRow[] {
  const seenRegions = new Set<string>()

  return regions.map((region, index) => {
    const normalized = region.trim().toLowerCase()
    const isDuplicate = seenRegions.has(normalized)
    if (!isDuplicate) seenRegions.add(normalized)

    const dc = findDatacenterByRegion(region, datacenters)
    const matched = Boolean(dc) && !isDuplicate

    return {
      key: `${region}-${index}`,
      containerInstanceRegion: region,
      dataCenterId: matched ? dc!.id : null,
      dataCenterName: dc?.name ?? '',
      regionName: dc?.regionCode ?? region,
      displayName: dc?.location ?? '',
      effectiveFrom: '',
      status: 'open',
      cpuQuotaInput: '',
      matchStatus: isDuplicate ? 'duplicate' : dc ? 'matched' : 'not_found',
    }
  })
}

function matchStatusLabel(row: MerchantImportRegionRow): string {
  if (row.matchStatus === 'duplicate') return '重复'
  if (row.matchStatus === 'not_found') return '未匹配'
  return '已匹配'
}

function matchStatusBadgeClass(row: MerchantImportRegionRow): string {
  if (row.matchStatus === 'matched') {
    return 'border-green-500/40 text-green-700 dark:text-green-300'
  }
  if (row.matchStatus === 'duplicate') {
    return 'border-amber-500/40 text-amber-700 dark:text-amber-300'
  }
  return 'border-destructive/40 text-destructive'
}

export function MerchantImportRegionsDialog({
  open,
  onOpenChange,
  merchantId,
  onImported,
}: MerchantImportRegionsDialogProps) {
  const utils = trpc.useUtils()
  const datacentersQuery = trpc.merchant.region.listAvailableDatacenters.useQuery(
    { merchantId },
    { enabled: open },
  )
  const batchCreateMutation = trpc.merchant.region.batchCreate.useMutation()

  const datacenters = datacentersQuery.data ?? []

  const [regionInput, setRegionInput] = useState('')
  const [rows, setRows] = useState<MerchantImportRegionRow[]>([])
  const [bulkEffectiveFrom, setBulkEffectiveFrom] = useState('')
  const [bulkStatus, setBulkStatus] = useState<MerchantRegionStatus>('open')

  const matchedCount = useMemo(
    () => rows.filter((row) => row.matchStatus === 'matched').length,
    [rows],
  )
  const invalidCount = rows.length - matchedCount
  const isSubmitting = batchCreateMutation.isPending
  const isLoadingDatacenters = datacentersQuery.isLoading

  const reset = () => {
    setRegionInput('')
    setRows([])
    setBulkEffectiveFrom('')
    setBulkStatus('open')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  const handleParse = () => {
    if (isLoadingDatacenters) {
      toast.error('机房列表加载中，请稍候')
      return
    }
    if (datacentersQuery.isError) {
      toast.error(datacentersQuery.error.message || '加载机房列表失败')
      return
    }

    const regions = parseContainerInstanceRegions(regionInput)
    if (regions.length === 0) {
      toast.error('请输入至少一个容器实例区域')
      return
    }
    setRows(buildImportRows(regions, datacenters))
  }

  const updateRow = (key: string, patch: Partial<MerchantImportRegionRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const applyBulkDefaults = () => {
    setRows((prev) =>
      prev.map((row) =>
        row.matchStatus === 'matched'
          ? {
              ...row,
              effectiveFrom: bulkEffectiveFrom || row.effectiveFrom,
              status: bulkStatus,
            }
          : row,
      ),
    )
    toast.success('已应用到全部已匹配行')
  }

  const handleSubmit = async () => {
    const matchedRows = rows.filter((row) => row.matchStatus === 'matched')
    if (matchedRows.length === 0) {
      toast.error('没有可导入的已匹配区域，请先解析并修正输入')
      return
    }

    const payloadRows: Array<{
      dataCenterId: string
      effectiveFrom: string
      displayName?: string
      status: MerchantRegionStatus
      availableGpuQuota: number | null
    }> = []

    for (const row of matchedRows) {
      if (!row.dataCenterId) continue

      if (!row.effectiveFrom.trim()) {
        toast.error(`「${row.containerInstanceRegion}」缺少生效开放时间`)
        return
      }

      const quotaTrim = row.cpuQuotaInput.trim()
      let availableGpuQuota: number | null = null
      if (quotaTrim !== '') {
        const parsed = Number(quotaTrim)
        if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
          toast.error(`「${row.containerInstanceRegion}」CPU 配额须为非负整数，或留空表示不限`)
          return
        }
        availableGpuQuota = parsed
      }

      payloadRows.push({
        dataCenterId: row.dataCenterId,
        effectiveFrom: row.effectiveFrom,
        displayName: row.displayName.trim() || undefined,
        status: row.status,
        availableGpuQuota,
      })
    }

    try {
      const created = await batchCreateMutation.mutateAsync({
        merchantId,
        rows: payloadRows,
      })
      await utils.merchant.region.list.invalidate({ merchantId })
      await utils.merchant.region.listAvailableDatacenters.invalidate({ merchantId })
      await onImported?.(created.map((region) => region.id))
      toast.success(`已成功导入 ${created.length} 条机房区域`)
      handleOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1280px)]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <UploadIcon className="size-4" />
            导入机房区域
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6">
          <div className="shrink-0 space-y-2">
            <Label htmlFor="merchant-import-regions-input">容器实例区域</Label>
            <Textarea
              id="merchant-import-regions-input"
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value)}
              placeholder={'每行一个，或用逗号、空格分隔\n例如：\ncn-beijing-yz\ncn-shanghai-lg'}
              rows={3}
              className="max-h-28 resize-none overflow-y-auto font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleParse}
                disabled={isLoadingDatacenters}
              >
                {isLoadingDatacenters ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    加载机房…
                  </>
                ) : (
                  '解析并匹配'
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                将根据容器实例区域自动匹配平台机房（{datacenters.length} 个可导入）
              </p>
            </div>
            {datacentersQuery.isError ? (
              <p className="text-xs text-destructive">
                {datacentersQuery.error.message || '加载机房列表失败'}
              </p>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              <Alert className="shrink-0">
                <AlertCircle className="size-4" />
                <AlertDescription className="text-sm">
                  已解析 {rows.length} 条：{matchedCount} 条已匹配
                  {invalidCount > 0 ? `，${invalidCount} 条需修正或移除` : ''}
                  。机房名称、区域名称已自动填充，可按需修改；请补充生效开放时间、展示名、开放状态与
                  CPU 配额。
                </AlertDescription>
              </Alert>

              <div className="flex shrink-0 flex-wrap items-end gap-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <Label className="text-xs">批量生效时间</Label>
                  <Input
                    type="date"
                    value={bulkEffectiveFrom}
                    onChange={(e) => setBulkEffectiveFrom(e.target.value)}
                    className="h-8 w-[160px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">批量开放状态</Label>
                  <Select
                    value={bulkStatus}
                    onValueChange={(v) => setBulkStatus(v as MerchantRegionStatus)}
                  >
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">开放</SelectItem>
                      <SelectItem value="closed">关闭</SelectItem>
                      <SelectItem value="maintenance">维护中</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={applyBulkDefaults}>
                  应用到已匹配行
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>容器实例区域</TableHead>
                      <TableHead>匹配</TableHead>
                      <TableHead>机房名称</TableHead>
                      <TableHead>区域名称</TableHead>
                      <TableHead>展示名</TableHead>
                      <TableHead>生效开放时间</TableHead>
                      <TableHead>开放状态</TableHead>
                      <TableHead>CPU 配额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.key}
                        className={cn(row.matchStatus !== 'matched' && 'bg-muted/40')}
                      >
                        <TableCell className="align-top break-all font-mono text-xs">
                          {row.containerInstanceRegion}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className={matchStatusBadgeClass(row)}>
                            {matchStatusLabel(row)}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={row.dataCenterName}
                            disabled={row.matchStatus !== 'matched'}
                            onChange={(e) =>
                              updateRow(row.key, { dataCenterName: e.target.value })
                            }
                            placeholder="机房名称"
                            className="h-8 min-w-0"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={row.regionName}
                            disabled={row.matchStatus !== 'matched'}
                            onChange={(e) => updateRow(row.key, { regionName: e.target.value })}
                            placeholder="区域名称"
                            className="h-8 min-w-0"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={row.displayName}
                            disabled={row.matchStatus !== 'matched'}
                            onChange={(e) => updateRow(row.key, { displayName: e.target.value })}
                            placeholder="商户侧展示名"
                            className="h-8 min-w-0"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            type="date"
                            value={row.effectiveFrom}
                            disabled={row.matchStatus !== 'matched'}
                            onChange={(e) =>
                              updateRow(row.key, { effectiveFrom: e.target.value })
                            }
                            className="h-8 min-w-0"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Select
                            value={row.status}
                            disabled={row.matchStatus !== 'matched'}
                            onValueChange={(v) =>
                              updateRow(row.key, { status: v as MerchantRegionStatus })
                            }
                          >
                            <SelectTrigger className="h-8 w-full min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">开放</SelectItem>
                              <SelectItem value="closed">关闭</SelectItem>
                              <SelectItem value="maintenance">维护中</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={row.cpuQuotaInput}
                            disabled={row.matchStatus !== 'matched'}
                            onChange={(e) =>
                              updateRow(row.key, { cpuQuotaInput: e.target.value })
                            }
                            placeholder="不限"
                            className="h-8 min-w-0"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || matchedCount === 0}>
            {isSubmitting ? '提交中…' : `确认导入${matchedCount > 0 ? `（${matchedCount}）` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
