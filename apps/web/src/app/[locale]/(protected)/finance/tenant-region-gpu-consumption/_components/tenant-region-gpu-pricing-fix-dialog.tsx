'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { EditPricingDialog } from '@/app/[locale]/(protected)/supplier/components/edit-pricing-dialog'
import { CreateCardPricingDialog } from '@/components/dashboard/create-card-pricing-dialog'
import { trpc } from '@/lib/trpc/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

export type TenantRegionGpuPricingFixTarget = {
  dataCenterId: string
  gpuCardTypeId: string
  dataCenterName: string | null
  gpuCardTypeName: string | null
  regionCode: string
  gpuModel: string
  usageMonth?: string
}

export function TenantRegionGpuPricingFixDialog({
  open,
  onOpenChange,
  target,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: TenantRegionGpuPricingFixTarget | null
  onSuccess: () => void
}) {
  const utils = trpc.useUtils()

  const contextQuery = trpc.finance.tenantRegionGpuConsumption.getPricingContext.useQuery(
    {
      dataCenterId: target?.dataCenterId ?? '',
      gpuCardTypeId: target?.gpuCardTypeId ?? '',
    },
    {
      enabled:
        open &&
        Boolean(target?.dataCenterId && target?.gpuCardTypeId),
    },
  )

  const refreshMutation = trpc.finance.tenantRegionGpuConsumption.refreshPricing.useMutation()

  const listInput = contextQuery.data
    ? { supplierId: contextQuery.data.supplierId }
    : undefined

  const { data: pricingRecords = [] } = trpc.supplier.unitCosts.listRecords.useQuery(listInput!, {
    enabled: open && Boolean(listInput?.supplierId) && !contextQuery.data?.record,
  })

  const { data: cardTypes = [] } = trpc.supplier.gpuCardTypes.listActive.useQuery(undefined, {
    enabled: open && !contextQuery.data?.record,
  })

  const handlePricingSaved = async () => {
    if (!target?.dataCenterId || !target.gpuCardTypeId) return
    try {
      const result = await refreshMutation.mutateAsync({
        dataCenterId: target.dataCenterId,
        gpuCardTypeId: target.gpuCardTypeId,
        usageMonth: target.usageMonth,
      })
      await utils.finance.tenantRegionGpuConsumption.listMonthly.invalidate()
      await utils.finance.tenantRegionGpuConsumption.listDaily.invalidate()
      await utils.finance.tenantRegionGpuConsumption.getMonthlyRowDetail.invalidate()
      toast.success(
        `成本已更新：刷新日表 ${result.updatedDaily} 行、月表 ${result.updatedMonthly} 行`,
      )
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '刷新卡时消费定价失败')
    }
  }

  React.useEffect(() => {
    if (!open || !contextQuery.error) return
    toast.error(contextQuery.error.message)
    onOpenChange(false)
  }, [open, contextQuery.error, onOpenChange])

  if (!open || !target?.dataCenterId || !target.gpuCardTypeId) {
    return null
  }

  if (contextQuery.isLoading || !contextQuery.data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>加载成本配置</DialogTitle>
            <DialogDescription>
              {target.dataCenterName ?? '机房'} · {target.gpuCardTypeName ?? target.gpuModel}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (contextQuery.error) {
    return null
  }

  const ctx = contextQuery.data

  if (ctx.record) {
    return (
      <EditPricingDialog
        open={open}
        onOpenChange={onOpenChange}
        record={ctx.record}
        listInput={listInput}
        onSuccess={() => void handlePricingSaved()}
      />
    )
  }

  return (
    <CreateCardPricingDialog
      open={open}
      onOpenChange={onOpenChange}
      supplier={{
        id: ctx.supplierId,
        name: ctx.supplierName,
        shortName: ctx.supplierShortName ?? ctx.supplierName,
      }}
      lockedDataCenter={{ id: ctx.dataCenterId, name: ctx.dataCenterName }}
      lockedGpuCardTypeId={ctx.gpuCardTypeId}
      existingRecords={pricingRecords}
      cardTypes={cardTypes}
      listInput={listInput}
      onSuccess={() => void handlePricingSaved()}
    />
  )
}

export function isTenantRegionGpuPricingFixable(row: {
  pricingResolveStatus: string
  dataCenterId: string | null
  gpuCardTypeId: string | null
}): boolean {
  return row.pricingResolveStatus === 'pricing_pair_not_found' && Boolean(row.dataCenterId && row.gpuCardTypeId)
}
