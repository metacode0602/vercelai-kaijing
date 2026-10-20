'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@workspace/ui/components/button'
import { DatacenterSellPriceDialog } from '@/components/dashboard/datacenter-sell-price-dialog'
import {
  PlatformPriceDialog,
  type PlatformPriceFormValues,
} from '@/components/dashboard/platform-price-dialog'
import {
  PlatformPricePeriodDialog,
  type PlatformPricePeriodSavePayload,
} from '@/components/dashboard/platform-price-period-dialog'
import { useSession } from '@/lib/auth-client'
import { normalizeAppRole } from '@/lib/auth/app-role'
import type { GPUCardType } from '@/lib/data/types'
import { toPeriodRows, toPlatformProductLinePriceRows } from '@/lib/platform-pricing/transforms'
import {
  formatPeriodRange,
  getPeriodPhase,
  parsePeriodDate,
  platformPricePeriodPhaseNames,
} from '@/lib/platform-pricing/periods'
import type {
  PlatformCardPriceRecord,
  SupplierDatacenterSellPrice,
} from '@/lib/types/platform-pricing'
import type {
  PlatformCardPricePeriodRow,
  PlatformDatacenterPriceGroupRow,
  PlatformProductLinePriceRow,
} from '@/lib/types/platform-pricing-views'
import { trpc } from '@/lib/trpc/client'
import { CardTypeDetailDatacenters } from './platform-pricing/card-type-detail-datacenters'
import { CardTypeDetailPeriods } from './platform-pricing/card-type-detail-periods'
import { CardTypeDetailPlatformPrices } from './platform-pricing/card-type-detail-platform-prices'
import { PricingHistoryDialog } from './platform-pricing/pricing-history-dialog'
import { cardTypeLabel } from './platform-pricing/platform-pricing-utils'

type LocalPeriodMeta = {
  periodId: string
  effectiveFrom: string
  effectiveTo: string | null
}

const EMPTY_PLATFORM_RECORDS: PlatformCardPriceRecord[] = []
const EMPTY_SELL_RECORDS: SupplierDatacenterSellPrice[] = []

function mergePeriodRows(
  records: PlatformCardPriceRecord[],
  cardTypeId: string,
  emptyPeriods: LocalPeriodMeta[],
): PlatformCardPricePeriodRow[] {
  const fromRecords = toPeriodRows(records, cardTypeId)
  const existingIds = new Set(fromRecords.map((period) => period.periodId))
  const extras = emptyPeriods
    .filter((period) => !existingIds.has(period.periodId))
    .map((period) => {
      const phase = getPeriodPhase(period.effectiveFrom, period.effectiveTo, false)
      return {
        periodId: period.periodId,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: period.effectiveTo,
        rangeLabel: formatPeriodRange(period.effectiveFrom, period.effectiveTo),
        phase,
        phaseLabel: platformPricePeriodPhaseNames[phase],
        priceEntryCount: 0,
        isCurrent: false,
      }
    })

  const merged = [...fromRecords, ...extras]
  const currentCandidates = merged.filter((period) => period.phase === 'current')
  if (currentCandidates.length === 1) {
    currentCandidates[0]!.isCurrent = true
  }

  return merged.sort(
    (a, b) => parsePeriodDate(b.effectiveFrom) - parsePeriodDate(a.effectiveFrom),
  )
}

async function invalidatePlatformPricingQueries(
  utils: ReturnType<typeof trpc.useUtils>,
  cardTypeId: string,
  options?: { includeHistory?: boolean; includeSell?: boolean },
) {
  await Promise.all([
    utils.supplier.platformPricing.getDetailPage.invalidate({ cardTypeId }),
    utils.supplier.platformPricing.listRecordsForCardType.invalidate({ cardTypeId }),
    utils.supplier.platformPricing.listPage.invalidate(),
    utils.supplier.platformPricing.listRecords.invalidate(),
    options?.includeSell
      ? utils.supplier.platformPricing.listSellPricesForCardType.invalidate({ cardTypeId })
      : Promise.resolve(),
    options?.includeHistory
      ? utils.supplier.platformPricing.listHistory.invalidate({ cardTypeId })
      : Promise.resolve(),
  ])
}

type PlatformPricingDetailContentProps = {
  cardTypeId: string
}

export function PlatformPricingDetailContent({ cardTypeId }: PlatformPricingDetailContentProps) {
  const utils = trpc.useUtils()
  const { data: session } = useSession()
  const isAdmin = normalizeAppRole(session?.user?.role) === 'admin'

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    error: detailErrorObj,
    refetch: refetchDetail,
  } = trpc.supplier.platformPricing.getDetailPage.useQuery({ cardTypeId })

  const { data: platformRecordsData } =
    trpc.supplier.platformPricing.listRecordsForCardType.useQuery({ cardTypeId })
  const platformRecords = platformRecordsData ?? EMPTY_PLATFORM_RECORDS

  const { data: sellRecordsData } =
    trpc.supplier.platformPricing.listSellPricesForCardType.useQuery({ cardTypeId })
  const sellRecords = sellRecordsData ?? EMPTY_SELL_RECORDS

  const [localEmptyPeriods, setLocalEmptyPeriods] = useState<LocalPeriodMeta[]>([])

  const { data: cardTypes = [] } = trpc.supplier.gpuCardTypes.listActive.useQuery()

  const [platformHistoryOpen, setPlatformHistoryOpen] = useState(false)
  const {
    data: platformHistory = [],
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = trpc.supplier.platformPricing.listHistory.useQuery(
    { cardTypeId },
    { enabled: platformHistoryOpen },
  )

  const [datacenterHistoryOpen, setDatacenterHistoryOpen] = useState(false)
  const [datacenterHistoryDc, setDatacenterHistoryDc] = useState<{
    id: string
    name: string
  } | null>(null)
  const {
    data: datacenterHistory = [],
    isLoading: dcHistoryLoading,
    isError: dcHistoryError,
    refetch: refetchDcHistory,
  } = trpc.supplier.platformPricing.listSellPriceHistory.useQuery(
    { cardTypeId, dataCenterId: datacenterHistoryDc?.id },
    { enabled: datacenterHistoryOpen && Boolean(datacenterHistoryDc?.id) },
  )

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)

  const [platformDialogOpen, setPlatformDialogOpen] = useState(false)
  const [editingPlatform, setEditingPlatform] = useState<PlatformCardPriceRecord | null>(null)

  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<PlatformCardPricePeriodRow | null>(null)

  const [sellDialogOpen, setSellDialogOpen] = useState(false)
  const [editingSell, setEditingSell] = useState<SupplierDatacenterSellPrice | null>(null)
  const [defaultSellDcId, setDefaultSellDcId] = useState<string | undefined>()

  const mergedPeriods = useMemo(
    () => mergePeriodRows(platformRecords, cardTypeId, localEmptyPeriods),
    [platformRecords, cardTypeId, localEmptyPeriods],
  )

  const mergedPeriodIdsKey = useMemo(
    () => mergedPeriods.map((period) => period.periodId).join('\0'),
    [mergedPeriods],
  )

  useEffect(() => {
    if (!detail) return
    setSelectedPeriodId((current) => {
      if (current && mergedPeriods.some((period) => period.periodId === current)) {
        return current
      }
      const next =
        mergedPeriods.find((period) => period.isCurrent)?.periodId ??
        detail.currentPeriodId ??
        mergedPeriods[0]?.periodId ??
        null
      return next === current ? current : next
    })
  }, [detail, mergedPeriodIdsKey, mergedPeriods])

  const createMutation = trpc.supplier.platformPricing.create.useMutation({
    onSuccess: async () => {
      toast.success('平台标准价已创建')
      setPlatformDialogOpen(false)
      setLocalEmptyPeriods((prev) =>
        selectedPeriodId
          ? prev.filter((period) => period.periodId !== selectedPeriodId)
          : prev,
      )
      await invalidatePlatformPricingQueries(utils, cardTypeId, {
        includeHistory: platformHistoryOpen,
      })
    },
    onError: (e) => toast.error(e.message || '创建失败，请稍后重试'),
  })

  const updateMutation = trpc.supplier.platformPricing.update.useMutation({
    onSuccess: async () => {
      toast.success('平台标准价已更新')
      setPlatformDialogOpen(false)
      await invalidatePlatformPricingQueries(utils, cardTypeId, { includeHistory: true })
    },
    onError: (e) => toast.error(e.message || '更新失败，请稍后重试'),
  })

  const createPeriodMutation = trpc.supplier.platformPricing.createPeriod.useMutation({
    onError: (e) => toast.error(e.message || '创建时间段失败，请稍后重试'),
  })

  const updatePeriodMutation = trpc.supplier.platformPricing.updatePeriod.useMutation({
    onError: (e) => toast.error(e.message || '更新时间段失败，请稍后重试'),
  })

  const createSellMutation = trpc.supplier.platformPricing.createDatacenterSellPrice.useMutation({
    onSuccess: async () => {
      toast.success('机房销售价已创建')
      setSellDialogOpen(false)
      setEditingSell(null)
      await invalidatePlatformPricingQueries(utils, cardTypeId, { includeSell: true })
      if (datacenterHistoryOpen) {
        await utils.supplier.platformPricing.listSellPriceHistory.invalidate()
      }
    },
    onError: (e) => toast.error(e.message || '创建机房销售价失败'),
  })

  const updateSellMutation = trpc.supplier.platformPricing.updateDatacenterSellPrice.useMutation({
    onSuccess: async () => {
      toast.success('机房销售价已更新')
      setSellDialogOpen(false)
      setEditingSell(null)
      await invalidatePlatformPricingQueries(utils, cardTypeId, { includeSell: true })
      if (datacenterHistoryOpen) {
        await utils.supplier.platformPricing.listSellPriceHistory.invalidate()
      }
    },
    onError: (e) => toast.error(e.message || '更新机房销售价失败'),
  })

  const isSellSaving = createSellMutation.isPending || updateSellMutation.isPending

  const periodSlice = useMemo(() => {
    if (!detail) {
      return {
        periods: [] as PlatformCardPricePeriodRow[],
        platformPrices: [] as PlatformProductLinePriceRow[],
        datacenters: [] as PlatformDatacenterPriceGroupRow[],
      }
    }
    return {
      periods: mergedPeriods,
      platformPrices: selectedPeriodId
        ? toPlatformProductLinePriceRows(cardTypeId, platformRecords, selectedPeriodId)
        : [],
      datacenters: detail.datacenters,
    }
  }, [detail, selectedPeriodId, cardTypeId, platformRecords, mergedPeriods])

  const selectedPeriod = useMemo(
    () => mergedPeriods.find((p) => p.periodId === selectedPeriodId) ?? null,
    [mergedPeriods, selectedPeriodId],
  )

  const card = useMemo((): GPUCardType | undefined => {
    const fromList = cardTypes.find((c) => c.id === cardTypeId)
    if (fromList) return fromList
    if (!detail) return undefined
    return {
      id: detail.cardTypeId,
      name: detail.cardTypeName,
      manufacturer: detail.manufacturer as GPUCardType['manufacturer'],
      memoryGB: detail.memoryGB,
      status: 'active',
    }
  }, [cardTypes, cardTypeId, detail])

  const resolvePlatformRecord = (
    row: {
      productLine: PlatformCardPriceRecord['productLine']
      billingUnit: PlatformCardPriceRecord['billingUnit']
    },
    periodId: string,
  ) =>
    platformRecords.find(
      (r) =>
        r.gpuCardTypeId === cardTypeId &&
        r.periodId === periodId &&
        r.productLine === row.productLine &&
        r.billingUnit === row.billingUnit,
    )

  const resolveSellRecord = (
    dataCenterId: string,
    productLine: SupplierDatacenterSellPrice['productLine'],
    billingUnit: SupplierDatacenterSellPrice['billingUnit'],
  ) =>
    sellRecords.find(
      (r) =>
        r.dataCenterId === dataCenterId &&
        r.productLine === productLine &&
        r.billingUnit === billingUnit,
    )

  const handlePeriodSaved = async (payload: PlatformPricePeriodSavePayload) => {
    try {
      if (editingPeriod) {
        const isLocalOnly = localEmptyPeriods.some(
          (period) => period.periodId === editingPeriod.periodId,
        )

        if (isLocalOnly) {
          setLocalEmptyPeriods((prev) =>
            prev.map((period) =>
              period.periodId === editingPeriod.periodId
                ? {
                    periodId: period.periodId,
                    effectiveFrom: payload.effectiveFrom,
                    effectiveTo: payload.effectiveTo ?? null,
                  }
                : period,
            ),
          )
          setSelectedPeriodId(editingPeriod.periodId)
          toast.success('时间段已更新')
        } else {
          await updatePeriodMutation.mutateAsync({
            gpuCardTypeId: cardTypeId,
            periodId: editingPeriod.periodId,
            effectiveFrom: payload.effectiveFrom,
            effectiveTo: payload.effectiveTo ?? null,
          })
          toast.success('时间段已更新')
          await invalidatePlatformPricingQueries(utils, cardTypeId, { includeHistory: true })
        }
      } else {
        const result = await createPeriodMutation.mutateAsync({
          gpuCardTypeId: cardTypeId,
          effectiveFrom: payload.effectiveFrom,
          effectiveTo: payload.effectiveTo ?? null,
          copyFromPeriodId: payload.copyFromPeriodId,
          autoClosePreviousCurrent: payload.autoClosePreviousCurrent,
          manualPrices: payload.manualPrices,
        })

        if (payload.manualPrices == null && !payload.copyFromPeriodId) {
          setLocalEmptyPeriods((prev) => [
            ...prev,
            {
              periodId: result.periodId,
              effectiveFrom: result.effectiveFrom,
              effectiveTo: result.effectiveTo,
            },
          ])
          toast.success('时间段已创建，请在下方补充产品线价格')
        } else if (payload.copyFromPeriodId) {
          toast.success('时间段已创建，已复制产品线价格')
        } else {
          toast.success(`时间段已创建，已配置 ${result.recordCount} 条价格`)
        }
        setSelectedPeriodId(result.periodId)
        await invalidatePlatformPricingQueries(utils, cardTypeId, { includeHistory: true })
      }

      setEditingPeriod(null)
      setPeriodDialogOpen(false)
    } catch {
      // 错误已在 mutation.onError 中 toast
    }
  }

  const handlePlatformSaved = (
    _record: PlatformCardPriceRecord,
    isNew: boolean,
    form: PlatformPriceFormValues,
  ) => {
    if (isNew) {
      createMutation.mutate(form)
      return
    }
    updateMutation.mutate({ recordId: _record.id, ...form })
  }

  const handleSellSaved = (record: SupplierDatacenterSellPrice, isNew: boolean) => {
    const payload = {
      supplierId: record.supplierId,
      dataCenterId: record.dataCenterId,
      gpuCardTypeId: record.gpuCardTypeId,
      productLine: record.productLine,
      billingUnit: record.billingUnit,
      sellPrice: record.sellPrice,
      inheritPlatformPrice: record.inheritPlatformPrice,
      effectiveFrom: record.effectiveFrom,
      remark: record.remark,
    }
    if (isNew) {
      createSellMutation.mutate(payload)
      return
    }
    updateSellMutation.mutate({ recordId: record.id, ...payload })
  }

  if (detailLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground">加载卡型定价详情中…</div>
    )
  }

  if (detailError || !detail) {
    return (
      <div className="space-y-4 py-8">
        <p className="text-destructive">
          {detailErrorObj?.message || '卡型不存在或加载失败'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchDetail()}>
            重试
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/supplier/platform-pricing">返回列表</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!card) return null

  const adminDenied = () => toast.info('平台刊例价仅管理员可维护')

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 h-8" asChild>
            <Link href="/supplier/platform-pricing">
              <ArrowLeft className="size-4" />
              返回列表
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{detail.cardTypeName}</h1>
          <p className="text-sm text-muted-foreground">{cardTypeLabel(card)}</p>
        </div>
        {isAdmin && (
          <Button variant="outline" className="gap-2 shrink-0" asChild>
            <Link href="/supplier/unit-costs">
              <DollarSign className="size-4" />
              机房成本定价
            </Link>
          </Button>
        )}
      </div>

      <CardTypeDetailPeriods
        periods={mergedPeriods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={setSelectedPeriodId}
        onAddPeriod={() => {
          if (!isAdmin) return adminDenied()
          setEditingPeriod(null)
          setPeriodDialogOpen(true)
        }}
        onEditPeriod={(period) => {
          if (!isAdmin) return adminDenied()
          setEditingPeriod(period)
          setPeriodDialogOpen(true)
        }}
      />

      <CardTypeDetailPlatformPrices
        selectedPeriod={selectedPeriod}
        rows={periodSlice.platformPrices}
        platformHistoryCount={detail.platformHistoryCount}
        onOpenHistory={() => setPlatformHistoryOpen(true)}
        onAddPrice={() => {
          if (!isAdmin) return adminDenied()
          setEditingPlatform(null)
          setPlatformDialogOpen(true)
        }}
        onEditPrice={(record) => {
          if (!isAdmin) return adminDenied()
          setEditingPlatform(record)
          setPlatformDialogOpen(true)
        }}
        resolveRecord={(row) =>
          row.recordId
            ? platformRecords.find((r) => r.id === row.recordId)
            : selectedPeriodId
              ? resolvePlatformRecord(row, selectedPeriodId)
              : undefined
        }
      />

      <CardTypeDetailDatacenters
        datacenters={periodSlice.datacenters}
        onOpenDatacenterHistory={(dataCenterId, dataCenterName) => {
          setDatacenterHistoryDc({ id: dataCenterId, name: dataCenterName })
          setDatacenterHistoryOpen(true)
        }}
        onEditSellPrice={(record) => {
          setEditingSell(record)
          setDefaultSellDcId(record.dataCenterId)
          setSellDialogOpen(true)
        }}
        onAddSellPrice={(dataCenterId) => {
          setEditingSell(null)
          setDefaultSellDcId(dataCenterId)
          setSellDialogOpen(true)
        }}
        resolveSellRecord={resolveSellRecord}
      />

      {isAdmin && (
        <>
          <PlatformPricePeriodDialog
            open={periodDialogOpen}
            onOpenChange={setPeriodDialogOpen}
            cardTypeId={cardTypeId}
            cardTypeName={detail.cardTypeName}
            existingRecords={platformRecords}
            periods={mergedPeriods}
            editing={editingPeriod}
            isSubmitting={createPeriodMutation.isPending || updatePeriodMutation.isPending}
            onSaved={handlePeriodSaved}
          />

          <PlatformPriceDialog
            open={platformDialogOpen}
            onOpenChange={setPlatformDialogOpen}
            existingRecords={platformRecords}
            cardTypes={cardTypes.length > 0 ? cardTypes : [card]}
            editing={editingPlatform}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            defaultCardTypeId={cardTypeId}
            periodId={selectedPeriodId ?? undefined}
            periodEffectiveFrom={selectedPeriod?.effectiveFrom}
            periodEffectiveTo={selectedPeriod?.effectiveTo ?? null}
            onSaved={handlePlatformSaved}
          />
        </>
      )}

      <DatacenterSellPriceDialog
        open={sellDialogOpen}
        onOpenChange={setSellDialogOpen}
        existingRecords={sellRecords}
        cardTypes={cardTypes.length > 0 ? cardTypes : [card]}
        editing={editingSell}
        defaultCardTypeId={cardTypeId}
        defaultDataCenterId={defaultSellDcId}
        defaultSupplierId={
          defaultSellDcId
            ? periodSlice.datacenters.find((d) => d.dataCenterId === defaultSellDcId)?.supplierId
            : undefined
        }
        isSubmitting={isSellSaving}
        onSaved={handleSellSaved}
      />

      <PricingHistoryDialog
        open={platformHistoryOpen}
        onOpenChange={setPlatformHistoryOpen}
        mode="platform"
        title={`${detail.cardTypeName} · 平台调价历史`}
        description="L1 平台标准价变更记录（全时间段）"
        platformHistory={platformHistory}
        isLoading={historyLoading}
        isError={historyError}
        onRetry={() => refetchHistory()}
      />

      <PricingHistoryDialog
        open={datacenterHistoryOpen}
        onOpenChange={setDatacenterHistoryOpen}
        mode="datacenter"
        title={`${datacenterHistoryDc?.name ?? '机房'} · 销售价调价历史`}
        description="机房级销售价变更记录（L1 机房级覆盖）"
        datacenterHistory={datacenterHistory}
        isLoading={dcHistoryLoading}
        isError={dcHistoryError}
        onRetry={() => refetchDcHistory()}
      />
    </div>
  )
}
