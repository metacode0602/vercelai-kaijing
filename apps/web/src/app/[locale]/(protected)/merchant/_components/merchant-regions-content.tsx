'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Server, Trash2, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { MerchantDatacenterRegion } from '@/lib/types/merchant'
import { trpc } from '@/lib/trpc/client'
import { MerchantAddRegionDialog } from './merchant-add-region-dialog'
import { MerchantEditRegionDialog } from './merchant-edit-region-dialog'
import { MerchantImportRegionsDialog } from './merchant-import-regions-dialog'
import { MerchantDetailNav } from './merchant-detail-nav'
import { MerchantRegionCardTypesDialog } from './merchant-region-card-types-dialog'
import { MerchantRegionPricingDialog } from './merchant-region-pricing-dialog'
import {
  formatQuota,
  quotaUsagePercent,
  REGION_STATUS_BADGE,
  merchantRegionStatusLabels,
} from './merchant-utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Progress } from '@workspace/ui/components/progress'
import { cn } from '@workspace/ui/lib/utils'

export function MerchantRegionsContent({ merchantId }: { merchantId: string }) {
  const utils = trpc.useUtils()
  const merchantQuery = trpc.merchant.getById.useQuery({ id: merchantId })
  const regionsQuery = trpc.merchant.region.list.useQuery({ merchantId })
  const [selectedId, setSelectedId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingRegion, setPricingRegion] = useState<MerchantDatacenterRegion | null>(null)
  const [cardTypesOpen, setCardTypesOpen] = useState(false)
  const [cardTypesRegion, setCardTypesRegion] = useState<MerchantDatacenterRegion | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editRegion, setEditRegion] = useState<MerchantDatacenterRegion | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MerchantDatacenterRegion | null>(null)

  const deleteMutation = trpc.merchant.region.delete.useMutation({
    onSuccess: async () => {
      toast.success('区域已删除')
      setDeleteTarget(null)
      await utils.merchant.region.list.invalidate({ merchantId })
      await utils.merchant.region.listAvailableDatacenters.invalidate({ merchantId })
      await utils.merchant.activity.list.invalidate({ merchantId })
    },
    onError: (error) => {
      toast.error(error.message || '删除失败')
    },
  })

  const regions = regionsQuery.data ?? []

  useEffect(() => {
    if (regions.length === 0) {
      setSelectedId('')
      return
    }
    if (!regions.some((r) => r.id === selectedId)) {
      setSelectedId(regions[0]?.id ?? '')
    }
  }, [regions, selectedId])

  if (merchantQuery.isLoading || regionsQuery.isLoading) {
    return <p className="text-muted-foreground py-8">加载中…</p>
  }

  const merchant = merchantQuery.data
  if (!merchant) {
    return <p className="text-muted-foreground">商户不存在</p>
  }

  if (regionsQuery.isError) {
    return (
      <p className="text-muted-foreground py-8">
        {regionsQuery.error.message || '加载区域失败'}
      </p>
    )
  }

  const selected = regions.find((r) => r.id === selectedId) ?? regions[0]

  const handlePricingSaved = ({
    regionId,
    effectiveFrom,
  }: {
    regionId: string
    effectiveFrom: string
  }) => {
    utils.merchant.region.list.setData({ merchantId }, (prev) =>
      prev?.map((r) => (r.id === regionId ? { ...r, effectiveFrom } : r)),
    )
  }

  const openPricingDialog = (region: MerchantDatacenterRegion) => {
    setPricingRegion(region)
    setPricingOpen(true)
  }

  const openCardTypesDialog = (region: MerchantDatacenterRegion) => {
    setCardTypesRegion(region)
    setCardTypesOpen(true)
  }

  const openEditDialog = (region: MerchantDatacenterRegion) => {
    setEditRegion(region)
    setEditOpen(true)
  }

  const handleRegionSaved = async (updated: MerchantDatacenterRegion) => {
    utils.merchant.region.list.setData({ merchantId }, (prev) =>
      prev?.map((r) => (r.id === updated.id ? updated : r)),
    )
    await utils.merchant.activity.list.invalidate({ merchantId })
  }

  const handleCardTypesSaved = (updated: MerchantDatacenterRegion) => {
    utils.merchant.region.list.setData({ merchantId }, (prev) =>
      prev?.map((r) => (r.id === updated.id ? updated : r)),
    )
  }

  return (
    <div className="space-y-6">
      <MerchantDetailNav merchant={merchant} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          为商户开放机房区域；添加时仅可从平台已有机房中选择。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            添加机房区域
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <UploadIcon className="size-4" />
            导入机房区域
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="size-4" />
              已配置区域
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {regions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无区域配置</p>
            ) : (
              regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => setSelectedId(region.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                    selected?.id === region.id
                      ? 'bg-primary/10 text-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  <div className="font-medium truncate">
                    {region.displayName ?? region.dataCenterName}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{region.regionCode}</div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selected ? (
          <RegionDetailPanel
            region={selected}
            onEdit={() => openEditDialog(selected)}
            onConfigurePricing={() => openPricingDialog(selected)}
            onConfigureCardTypes={() => openCardTypesDialog(selected)}
            onDelete={() => setDeleteTarget(selected)}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {regions.length === 0 ? '点击「添加机房区域」开始配置' : '请选择左侧区域'}
            </CardContent>
          </Card>
        )}
      </div>

      <MerchantAddRegionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        merchantId={merchantId}
        onAdded={async (regionId) => {
          await utils.merchant.region.list.invalidate({ merchantId })
          await utils.merchant.region.listAvailableDatacenters.invalidate({ merchantId })
          if (regionId) setSelectedId(regionId)
        }}
      />

      <MerchantImportRegionsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        merchantId={merchantId}
        onImported={async (regionIds) => {
          if (regionIds[0]) setSelectedId(regionIds[0])
        }}
      />

      <MerchantRegionPricingDialog
        open={pricingOpen}
        onOpenChange={setPricingOpen}
        merchantId={merchantId}
        region={pricingRegion}
        onSaved={handlePricingSaved}
      />

      <MerchantRegionCardTypesDialog
        open={cardTypesOpen}
        onOpenChange={setCardTypesOpen}
        merchantId={merchantId}
        region={cardTypesRegion}
        onSaved={handleCardTypesSaved}
      />

      <MerchantEditRegionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        merchantId={merchantId}
        region={editRegion}
        onSaved={handleRegionSaved}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除机房区域？</AlertDialogTitle>
            <AlertDialogDescription>
              将移除区域「
              {deleteTarget?.displayName ?? deleteTarget?.dataCenterName ?? '—'}」（
              {deleteTarget?.regionCode ?? '—'}）。删除后该区域不再对商户开放，相关进货价配置仍保留，可在活动记录中查看操作历史。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return
                deleteMutation.mutate({
                  merchantId,
                  regionId: deleteTarget.id,
                })
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RegionDetailPanel({
  region,
  onEdit,
  onConfigurePricing,
  onConfigureCardTypes,
  onDelete,
}: {
  region: MerchantDatacenterRegion
  onEdit: () => void
  onConfigurePricing: () => void
  onConfigureCardTypes: () => void
  onDelete: () => void
}) {
  const usage = quotaUsagePercent(region.availableGpuQuota, region.usedGpuCount)
  const cardTypes = region.enabledCardTypes ?? []
  const availableCardTypes = region.availableCardTypes ?? cardTypes.map((card) => ({ ...card, enabled: true }))
  const canEditCardTypes = availableCardTypes.length > 1

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {region.displayName ?? region.dataCenterName}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {region.location} · {region.regionCode}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onEdit}>
              <Pencil className="size-3.5" />
              编辑
            </Button>
            <Badge variant="outline" className={REGION_STATUS_BADGE[region.status]}>
              {merchantRegionStatusLabels[region.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">关联机房 ID</p>
            <p className="font-mono text-xs">{region.dataCenterId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">生效开始时间</p>
            <p>{region.effectiveFrom}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GPU 配额</span>
            <span className="tabular-nums">
              {formatQuota(region.availableGpuQuota, region.usedGpuCount)}
            </span>
          </div>
          {region.availableGpuQuota !== null ? (
            <Progress value={usage} className="h-2" />
          ) : (
            <p className="text-xs text-muted-foreground">未设置上限（不限配额）</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">启用卡型</p>
            {canEditCardTypes ? (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onConfigureCardTypes}>
                配置
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {cardTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无启用卡型</p>
            ) : (
              cardTypes.map((card) => (
                <Badge key={card.id} variant="secondary">
                  {card.name}
                </Badge>
              ))
            )}
          </div>
          {!canEditCardTypes && availableCardTypes.length === 1 ? (
            <p className="text-muted-foreground mt-2 text-xs">该机房仅有一种卡型，无法关闭。</p>
          ) : null}
        </div>

        <Button variant="outline" size="sm" onClick={onConfigurePricing}>
          配置该区域进货价
        </Button>

        <div className="flex justify-end border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            删除区域
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
