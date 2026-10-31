'use client'

/**
 * F32 按柜次的 SKU 到仓成本版本（localStorage）。
 * @see apps/shop/content/design/daraz-lk-erp-p0-ued.md
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import type { CostCalculatorInput, CostCalculatorResult } from '@/lib/crossborder/cost-calculator'

export type SkuCostVersion = {
  id: string
  sku: string
  title: string
  containerLotId: string
  lotCode: string
  versionNo: number
  /** @deprecated 文案回退；优先 feeTemplateVersionId */
  taxTemplateCode: string
  feeTemplateVersionId: string | null
  currency: string
  landedUnitCost: number
  suggestPrice: number | null
  freightMode: string
  effectiveFrom: string
  createdBy: string
  taxBreakdown: Record<string, number>
  snapshot: {
    input: Partial<CostCalculatorInput>
    waterfall: Array<{ id: string; labelZh: string; unitUsd: number; totalUsd: number }>
    components: Array<{ code: string; labelZh: string; rate: number; unit: string }>
  }
  status: string
}

const SEED: SkuCostVersion[] = [
  {
    id: 'SCV-TEE-001-LOT08-v1',
    sku: 'TEE-001',
    title: '速干 Polo',
    containerLotId: 'LOT-CMB-2026-08-01',
    lotCode: 'LOT-CMB-2026-08-01',
    versionNo: 1,
    taxTemplateCode: 'LK_PAL_CESS_VAT_SSCL',
    feeTemplateVersionId: 'FTV-DARAZ-LK-APPAREL-V1',
    currency: 'USD',
    landedUnitCost: 4.82,
    suggestPrice: 12.9,
    freightMode: 'FCL40',
    effectiveFrom: '2026-08-28',
    createdBy: '杨洁',
    taxBreakdown: { pal: 0.21, cess: 0.08, vat: 0.55, sscl: 0.12 },
    snapshot: {
      input: { sku: 'TEE-001', freightMode: 'FCL40' },
      waterfall: [
        { id: 'purchase', labelZh: '采购', unitUsd: 2.1, totalUsd: 630 },
        { id: 'freight', labelZh: '海运分摊', unitUsd: 1.4, totalUsd: 420 },
        { id: 'tax', labelZh: '进口税瀑布', unitUsd: 0.96, totalUsd: 288 },
        { id: 'other', labelZh: '清关杂费', unitUsd: 0.36, totalUsd: 108 },
      ],
      components: [],
    },
    status: '已生效',
  },
]

const store = createDemoStore<SkuCostVersion[]>('open-shop.console.demo.sku-cost-versions.v1', SEED)

export function useSkuCostVersions() {
  return store.useStore()
}

export function getSkuCostVersions() {
  return store.get()
}

export function listSkuCostVersions(sku?: string) {
  const all = store.get()
  return sku ? all.filter((row) => row.sku === sku) : all
}

export function saveSkuCostVersionFromCalculator(args: {
  input: CostCalculatorInput
  result: CostCalculatorResult
  containerLotId: string
  lotCode: string
  createdBy?: string
}) {
  const existing = store.get().filter(
    (row) => row.sku === args.input.sku && row.containerLotId === args.containerLotId,
  )
  const versionNo = existing.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1
  const tax = args.result.tax
  const row: SkuCostVersion = {
    id: `SCV-${args.input.sku}-${args.lotCode}-v${versionNo}`,
    sku: args.input.sku,
    title: args.input.title,
    containerLotId: args.containerLotId,
    lotCode: args.lotCode,
    versionNo,
    taxTemplateCode: args.result.meta.feeTemplateCode ?? 'LK_PAL_CESS_VAT_SSCL',
    feeTemplateVersionId: args.result.meta.feeTemplateVersionId,
    currency: 'USD',
    landedUnitCost: Number(args.result.landedUnit.toFixed(4)),
    suggestPrice: args.result.suggestPrice,
    freightMode: args.input.freightMode,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    createdBy: args.createdBy ?? '杨洁',
    taxBreakdown: {
      pal: Number((tax.pal / Math.max(args.input.units, 1)).toFixed(4)),
      cess: Number((tax.cess / Math.max(args.input.units, 1)).toFixed(4)),
      vat: Number((tax.vat / Math.max(args.input.units, 1)).toFixed(4)),
      sscl: Number((tax.sscl / Math.max(args.input.units, 1)).toFixed(4)),
    },
    snapshot: {
      input: {
        sku: args.input.sku,
        title: args.input.title,
        freightMode: args.input.freightMode,
        tariffProfileId: args.input.tariffProfileId,
        units: args.input.units,
      },
      waterfall: args.result.waterfall.map((line) => ({
        id: line.id,
        labelZh: line.labelZh,
        unitUsd: line.unitUsd,
        totalUsd: line.totalUsd,
      })),
      components: args.result.meta.componentsSnapshot,
    },
    status: '已生效',
  }
  store.set([row, ...store.get()])
  return row
}
