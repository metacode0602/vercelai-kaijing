'use client'

import * as React from 'react'
import { Pencil } from 'lucide-react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  legacyGroupsToSections,
  parentsToFields,
  type DetailRelatedGroup,
  type DetailRelatedInfo,
  type DetailRelatedItem,
} from '@/components/console/detail'
import { UedDialog, type UedDialogField } from '@/components/console/erp-ued-workspace'
import { UED_RECORD_LABELS } from '@/lib/crossborder/erp-ued-labels'
import {
  buildPrimaryPricingFields,
  buildUedRelatedInfo,
  resolveSkuFromRow,
} from '@/lib/console/related-info'
import { getCostBySku, getOrderById } from '@/lib/crossborder/mock-data'
import {
  ERP_DEMO_AFTERSALES,
  ERP_DEMO_BINS,
  ERP_DEMO_INVENTORY,
  ERP_DEMO_MAPPINGS,
  ERP_DEMO_PRODUCTS,
  ERP_DEMO_PURCHASES,
  ERP_DEMO_SUPPLIERS,
} from '@/lib/crossborder/erp-ued-data'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export type UedRecord = Record<string, unknown>

type RelatedItem = DetailRelatedItem
type RelatedGroup = DetailRelatedGroup

const STATUS_KEYS = new Set(['status', 'result', 'qc', 'mappingStatus', 'platformSync', 'listingStatus'])

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function formatScalar(value: string | number | boolean) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function looksLikeOrderId(value: string) {
  return /^(DZ|LZ|TK)-\d+/i.test(value)
}

function buildRelated(row: UedRecord): RelatedGroup[] {
  const groups: RelatedGroup[] = []
  const skuValue =
    row.sku ??
    row.internalSku ??
    (typeof row.id === 'string' && /^[A-Z]{2,}\d{6,}$/.test(row.id) ? row.id : undefined)
  const sku =
    typeof skuValue === 'string' && skuValue !== '—'
      ? skuValue.replace(/[（(][^)）]*[)）]\s*$/, '').trim()
      : undefined
  if (sku) {
    const items: RelatedItem[] = []
    const product = ERP_DEMO_PRODUCTS.find((item) => item.variants.some((variant) => variant.code === sku))
    if (product) items.push({ label: `商品 ${product.spu}`, href: `/console/master-products/${encodeURIComponent(product.spu)}` })
    const supplier = ERP_DEMO_SUPPLIERS.find((item) => item.sku === sku && item.code !== row.code)
    if (supplier) items.push({ label: `供应商 ${supplier.name}`, href: `/console/suppliers/${encodeURIComponent(supplier.code)}` })
    const balance = ERP_DEMO_INVENTORY.find((item) => item.sku === sku)
    if (balance) {
      items.push({
        label: `库存 ${balance.onHand} 件 · ${balance.bin}`,
        href: `/console/inventory-balances/${encodeURIComponent(`${balance.warehouse}-${balance.bin}-${balance.sku}`)}`,
      })
    }
    for (const mapping of ERP_DEMO_MAPPINGS.filter((item) => item.internalSku === sku && !(item.shop === row.shop && item.sellerSku === row.sellerSku)).slice(0, 2)) {
      items.push({ label: `映射 ${mapping.shop} · ${mapping.sellerSku}`, href: `/console/mappings/${encodeURIComponent(`${mapping.shop}::${mapping.sellerSku}`)}` })
    }
    for (const purchase of ERP_DEMO_PURCHASES.filter((item) => item.sku === sku && item.id !== row.id).slice(0, 2)) {
      items.push({ label: `采购 ${purchase.id}`, href: `/console/purchases/${encodeURIComponent(purchase.id)}` })
    }
    for (const aftersale of ERP_DEMO_AFTERSALES.filter((item) => item.sku === sku && item.id !== row.id).slice(0, 2)) {
      items.push({ label: `售后 ${aftersale.id}`, href: `/console/aftersales/${encodeURIComponent(aftersale.id)}` })
    }
    groups.push({
      title: '商品与库存',
      description: `内部 SKU ${sku} 的上下游记录`,
      items: [
        ...items,
        { label: '内部 SKU 主档', href: `/console/master-skus/${encodeURIComponent(sku)}` },
        getCostBySku(sku)
          ? { label: 'SKU 成本', href: `/console/costs/${encodeURIComponent(sku)}` }
          : { label: '成本测算', href: '/console/costs' },
      ],
    })
  }

  if (typeof row.spu === 'string') {
    const product = ERP_DEMO_PRODUCTS.find((item) => item.spu === row.spu)
    const variantItems: RelatedItem[] = Array.isArray(row.variants)
      ? []
      : (product?.variants ?? []).slice(0, 4).map((variant) => ({ label: `SKU ${variant.code}`, href: `/console/master-skus/${encodeURIComponent(variant.code)}` }))
    groups.push({
      title: '商品主档',
      description: product?.name,
      items: [
        ...variantItems,
        ...(Array.isArray(row.variants) ? [] : [{ label: '商品库 SPU', href: `/console/master-products/${encodeURIComponent(row.spu)}` }]),
        { label: '刊登列表', href: '/console/listings' },
      ],
    })
  }

  const orderValue = row.order ?? (typeof row.id === 'string' && looksLikeOrderId(row.id) ? row.id : undefined)
  const order = typeof orderValue === 'string' && looksLikeOrderId(orderValue) ? orderValue : undefined
  if (order) {
    const relatedAftersales: RelatedItem[] = ERP_DEMO_AFTERSALES
      .filter((item) => item.order === order && item.id !== row.id)
      .slice(0, 3)
      .map((item) => ({ label: `售后 ${item.id} · ${item.type}`, href: `/console/aftersales/${encodeURIComponent(item.id)}` }))
    groups.push({
      title: '订单与履约',
      description: `原订单 ${order}`,
      items: [
        getOrderById(order)
          ? { label: '订单详情', href: `/console/orders/${encodeURIComponent(order)}` }
          : { label: `订单 ${order}`, href: '/console/orders' },
        ...relatedAftersales,
        { label: '包裹与物流', href: '/console/shipments' },
        { label: '拣货打包发货', href: '/console/picking' },
        { label: '订单与 SKU 利润', href: '/console/profits' },
      ],
    })
  }

  const rowId = typeof row.id === 'string' ? row.id : ''
  const poValue = typeof row.po === 'string' ? row.po : rowId.startsWith('PO-') ? rowId : undefined
  if (poValue) {
    groups.push({
      title: '采购链路',
      description: `采购单 ${poValue}`,
      items: [
        { label: '采购单', href: `/console/purchase-orders/${encodeURIComponent(poValue)}` },
        { label: '到货质检入库', href: '/console/purchase-receipts' },
        { label: '入库单', href: '/console/stock-inbounds' },
      ],
    })
  }

  if (typeof row.sourceRequest === 'string' || rowId.startsWith('PR-')) {
    const requestId = typeof row.sourceRequest === 'string' ? row.sourceRequest : rowId
    groups.push({
      title: '采购申请',
      description: requestId,
      items: [
        { label: '采购申请', href: '/console/purchase-requests' },
        { label: '采购审核', href: '/console/purchase-approvals' },
        { label: '采购单', href: '/console/purchase-orders' },
      ],
    })
  }

  if (rowId.startsWith('AS-')) {
    groups.push({
      title: '售后链路',
      items: [
        { label: '售后管理', href: '/console/aftersales' },
        { label: '退货收货', href: '/console/aftersale-returns' },
        { label: '取消与退款', href: '/console/aftersale-cancels' },
        { label: '入库单', href: '/console/stock-inbounds' },
      ],
    })
  }

  if (rowId.startsWith('RCV-')) {
    groups.push({
      title: '收货与入库',
      items: [
        { label: '到货质检入库', href: '/console/purchase-receipts' },
        { label: '入库单', href: '/console/stock-inbounds' },
        { label: '库存流水', href: '/console/inventory-ledger' },
      ],
    })
  }

  const sourceValue = row.sourceDoc ?? row.source
  if (typeof sourceValue === 'string' && sourceValue !== '—' && sourceValue !== '待审批') {
    const href = sourceValue.startsWith('RCV')
      ? '/console/purchase-receipts'
      : sourceValue.startsWith('AS')
        ? '/console/aftersales'
        : sourceValue.startsWith('PO')
          ? '/console/purchase-orders'
          : sourceValue.startsWith('DZ') || sourceValue.startsWith('LZ')
            ? '/console/orders'
            : '/console/inventory-ledger'
    groups.push({
      title: '来源单据',
      items: [{ label: sourceValue, href }],
    })
  }

  if (typeof row.supplier === 'string') {
    const supplier = ERP_DEMO_SUPPLIERS.find((item) => item.name === row.supplier && item.code !== row.code)
    groups.push({
      title: '供应商',
      description: row.supplier,
      items: [
        ...(supplier ? [{ label: `档案 ${supplier.code}`, href: `/console/suppliers/${encodeURIComponent(supplier.code)}` }] : []),
        { label: '供应商管理', href: '/console/suppliers' },
        { label: '供应商货号', href: '/console/supplier-skus' },
      ],
    })
  }

  if (typeof row.warehouse === 'string' || typeof row.bin === 'string') {
    const bins: RelatedItem[] = ERP_DEMO_BINS
      .filter((item) => (typeof row.warehouse !== 'string' || item.warehouse === row.warehouse) && item.code !== row.code)
      .slice(0, 3)
      .map((item) => ({ label: `库位 ${item.code}${item.sku !== '—' ? ` · ${item.sku}` : ''}`, href: `/console/warehouse/${encodeURIComponent(item.code)}` }))
    groups.push({
      title: '仓库与库位',
      items: [
        ...bins,
        { label: '仓库与库位', href: '/console/warehouse' },
        { label: '库存流水', href: '/console/inventory-ledger' },
        { label: '盘点与调整', href: '/console/stock-adjustments' },
      ],
    })
  }

  if (typeof row.shop === 'string') {
    const mappings: RelatedItem[] = ERP_DEMO_MAPPINGS
      .filter((item) => item.shop === row.shop && !(item.shop === row.shop && item.sellerSku === row.sellerSku))
      .slice(0, 3)
      .map((item) => ({ label: `${item.sellerSku} → ${item.internalSku}`, href: `/console/mappings/${encodeURIComponent(`${item.shop}::${item.sellerSku}`)}` }))
    groups.push({
      title: '店铺与平台',
      description: row.shop,
      items: [
        ...mappings,
        { label: '店铺连接', href: '/console/settings/shops' },
        { label: 'Seller SKU 映射', href: '/console/mappings' },
        { label: '发布与同步任务', href: '/console/sync-tasks' },
        { label: '平台结算对账', href: '/console/settlements' },
      ],
    })
  }

  if (typeof row.tracking === 'string' || typeof row.packageId === 'string') {
    groups.push({
      title: '物流',
      items: [
        { label: '包裹与物流', href: '/console/shipments' },
        { label: 'LGS 物流', href: '/console/logistics-lgs' },
        { label: 'JSB 与 TH 物流', href: '/console/logistics-jsb' },
      ],
    })
  }

  return groups
}

function humanize(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase())
}

function statusVariant(value: string) {
  if (/失败|异常|驳回|停用|差异|阻断|待审批|待确认/.test(value)) return 'outline' as const
  if (/成功|完成|已审核|已确认|启用|已入库|已回库|已签收|已出库/.test(value)) return 'secondary' as const
  return 'default' as const
}

const PRIMARY_FIELD_KEYS = new Set([
  'id', 'code', 'sku', 'spu', 'name', 'title', 'status', 'type', 'order', 'shop',
  'supplier', 'warehouse', 'platform', 'site', 'quantity', 'unitPrice', 'price',
  'currency', 'tracking', 'packageId', 'sellerSku', 'internalSku', 'dimension',
  'role', 'person', 'period', 'mode', 'carrier', 'applicant', 'approver',
])

const KPI_PRIORITY_KEYS = [
  'status', 'quantity', 'qty', 'onHand', 'available', 'reserved', 'damaged',
  'unitPrice', 'price', 'refund', 'revenue', 'cost', 'profit', 'margin',
  'billAmount', 'diffAmount', 'packages', 'items', 'arrived', 'qcPass',
  'received', 'passed', 'leadDays', 'weight', 'rating', 'retries', 'progress',
  'skuCount', 'success', 'errors', 'before', 'delta', 'after', 'fee',
]

function labelFor(key: string, labelMap: Record<string, string>) {
  return labelMap[key] ?? humanize(key)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectArrayTables(row: UedRecord, labelMap: Record<string, string>, timelineKey?: string) {
  const tables: { key: string; title: string; columns: string[]; rows: Record<string, unknown>[] }[] = []
  for (const [key, value] of Object.entries(row)) {
    if (key === timelineKey || !Array.isArray(value) || value.length === 0) continue
    if (value.every((item) => isObjectRecord(item))) {
      const rows = value as Record<string, unknown>[]
      const columns = Array.from(
        rows.reduce((set, item) => {
          for (const col of Object.keys(item)) {
            if (isScalar(item[col])) set.add(col)
          }
          return set
        }, new Set<string>()),
      )
      if (columns.length === 0) continue
      tables.push({
        key,
        title: labelFor(key, labelMap),
        columns,
        rows,
      })
    } else if (value.every((item) => isScalar(item))) {
      tables.push({
        key,
        title: labelFor(key, labelMap),
        columns: ['value'],
        rows: value.map((item) => ({ value: item as string | number | boolean })),
      })
    }
  }
  return tables
}

function buildKpiItems(
  row: UedRecord,
  labelMap: Record<string, string>,
): { label: string; value: string; hint?: string }[] {
  const items: { label: string; value: string; hint?: string }[] = []
  const used = new Set<string>()

  for (const key of KPI_PRIORITY_KEYS) {
    if (items.length >= 4) break
    if (!(key in row) || used.has(key)) continue
    const value = row[key]
    if (!isScalar(value)) continue
    used.add(key)
    if (key === 'status' || STATUS_KEYS.has(key)) {
      items.push({ label: labelFor(key, labelMap), value: String(value) })
      continue
    }
    if (typeof value === 'number') {
      const currency = typeof row.currency === 'string' ? row.currency : undefined
      const withCurrency =
        currency && /price|amount|refund|revenue|cost|profit|fee|bill|diff/i.test(key)
          ? `${value} ${currency}`
          : String(value)
      items.push({ label: labelFor(key, labelMap), value: withCurrency })
      continue
    }
    items.push({ label: labelFor(key, labelMap), value: formatScalar(value) })
  }

  if (items.length < 4) {
    for (const [key, value] of Object.entries(row)) {
      if (items.length >= 4) break
      if (used.has(key) || !isScalar(value) || typeof value !== 'number') continue
      used.add(key)
      items.push({ label: labelFor(key, labelMap), value: String(value) })
    }
  }

  if (items.length < 4) {
    for (const key of ['shop', 'warehouse', 'supplier', 'platform', 'site', 'mode', 'carrier']) {
      if (items.length >= 4) break
      if (used.has(key) || !(key in row)) continue
      const value = row[key]
      if (!isScalar(value)) continue
      used.add(key)
      items.push({ label: labelFor(key, labelMap), value: formatScalar(value) })
    }
  }

  return items
}

function splitFieldKeys(keys: string[]) {
  const primary = keys.filter((key) => PRIMARY_FIELD_KEYS.has(key))
  const supporting = keys.filter((key) => !PRIMARY_FIELD_KEYS.has(key))
  if (primary.length === 0) {
    return { primary: keys.slice(0, Math.min(8, keys.length)), supporting: keys.slice(8) }
  }
  if (supporting.length === 0 && primary.length > 8) {
    return { primary: primary.slice(0, 8), supporting: primary.slice(8) }
  }
  return { primary, supporting }
}

export function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function UedRecordDetail({
  backHref,
  moduleTitle,
  module,
  row,
  labels,
  idKey = 'id',
  titleKeys = ['id', 'name', 'title', 'dimension', 'code', 'sku', 'spu', 'role'],
  timelineKey,
  related,
  relatedInfo,
  notice,
  description,
  extra,
  showPrimaryPricing,
}: {
  backHref: string
  moduleTitle: string
  module?: string
  row: UedRecord
  labels?: Record<string, string>
  idKey?: string
  titleKeys?: string[]
  timelineKey?: string
  /** @deprecated Prefer relatedInfo (parents in 主数据 + child tables). */
  related?: RelatedGroup[]
  /** Classified related-info: parents → 主数据 links; sections → tables. */
  relatedInfo?: DetailRelatedInfo
  notice?: string
  description?: string
  extra?: React.ReactNode
  /** Force show/hide 主定价信息; default auto for SKU-centric modules. */
  showPrimaryPricing?: boolean
}) {
  const [current, setCurrent] = React.useState<UedRecord>(row)
  const [editing, setEditing] = React.useState(false)
  const [saved, setSaved] = React.useState('')
  const labelMap = labels ?? (module ? (UED_RECORD_LABELS[module] ?? {}) : {})

  const titleValue = titleKeys.map((key) => current[key]).find((value) => isScalar(value) && String(value).trim())
  const title = titleValue != null ? String(titleValue) : String(current[idKey] ?? '记录详情')
  const subtitle = [moduleTitle, typeof current.name === 'string' ? current.name : undefined, typeof current.shop === 'string' ? current.shop : undefined]
    .filter(Boolean)
    .join(' · ')

  const classified =
    relatedInfo ??
    (module && ['master-products', 'master-skus', 'supplier-skus', 'mappings'].includes(module)
      ? buildUedRelatedInfo(module, current)
      : undefined)

  // Scalar keys replaced by navigable parent fields in 主数据 (avoid duplicate plain text).
  const parentReplacedKeys = new Set<string>()
  if (classified?.parents?.length) {
    if (module === 'master-skus') parentReplacedKeys.add('spu')
    if (module === 'supplier-skus') {
      parentReplacedKeys.add('sku')
      parentReplacedKeys.add('supplier')
    }
    if (module === 'mappings') parentReplacedKeys.add('internalSku')
  }

  const fieldKeys = Object.keys(current).filter((key) => {
    const value = current[key]
    return isScalar(value) && key !== timelineKey && !parentReplacedKeys.has(key)
  })
  const { primary: primaryKeys, supporting: supportingKeys } = splitFieldKeys(fieldKeys)

  const toFields = (keys: string[]) =>
    keys.map((key) => ({
      label: labelFor(key, labelMap),
      value:
        STATUS_KEYS.has(key) && typeof current[key] === 'string' ? (
          <Badge variant={statusVariant(current[key] as string)}>{String(current[key])}</Badge>
        ) : (
          formatScalar(current[key] as string | number | boolean)
        ),
      mono: key === idKey || key.endsWith('Id') || key === 'sku' || key === 'spu' || key === 'sellerSku' || key === 'code',
    }))

  const parentFields = parentsToFields(classified?.parents)
  const primaryFields = [...toFields(primaryKeys), ...parentFields]
  const supportingFields = toFields(supportingKeys)
  const kpiItems = buildKpiItems(current, labelMap)

  // When classified related-info owns variants / listings, skip raw array dump for those keys.
  const skipArrayKeys =
    module === 'master-products' || module === 'master-skus'
      ? new Set(['variants'])
      : new Set<string>()
  const arrayTables = collectArrayTables(current, labelMap, timelineKey).filter(
    (table) => !skipArrayKeys.has(table.key),
  )

  const timeline = timelineKey && Array.isArray(current[timelineKey]) ? (current[timelineKey] as unknown[]).map(String) : []
  const relatedGroups = related ?? (!classified ? buildRelated(current) : [])
  const relatedSections =
    classified?.sections ??
    (relatedGroups.length > 0 ? legacyGroupsToSections(relatedGroups) : [])

  const skuForPricing = resolveSkuFromRow(current)
  const pricingAuto =
    showPrimaryPricing ??
    (module === 'master-skus' || module === 'supplier-skus' || module === 'mappings')
  const primaryPricing = pricingAuto ? buildPrimaryPricingFields(skuForPricing) : null

  const editFields: UedDialogField[] = fieldKeys.map((key) => {
    const value = current[key]
    return {
      key,
      label: labelFor(key, labelMap),
      defaultValue: typeof value === 'boolean' ? (value ? '是' : '否') : String(value ?? ''),
      options: typeof value === 'boolean' ? ['是', '否'] : undefined,
      type: typeof value === 'number' ? 'number' : /date|at$/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? 'date' : 'text',
      readOnly: key === idKey,
      required: key === idKey,
      fullWidth: String(value ?? '').length > 40,
    }
  })

  const noticeText = notice ?? '示例数据：仅在当前原型会话内查看与修改，不会写入业务数据库。'
  const breadcrumbCurrent = String(title)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[
          { label: moduleTitle, href: backHref },
          { label: breadcrumbCurrent },
        ]}
      />

      <DetailPageHeader
        backHref={backHref}
        title={title}
        description={description ?? subtitle}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            {typeof current.status === 'string' ? (
              <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
            ) : null}
          </>
        }
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" />
            编辑详情
          </Button>
        }
      />

      <Alert>
        <AlertTitle>UED 示例详情 · 非生产数据</AlertTitle>
        <AlertDescription>{noticeText}</AlertDescription>
      </Alert>

      {kpiItems.length > 0 ? <DetailKpiRow items={kpiItems} /> : null}

      <DetailFieldGrid
        title="主数据"
        fields={primaryFields}
        columns={primaryFields.length >= 7 ? 4 : 3}
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" />
            编辑
          </Button>
        }
      />

      {supportingFields.length > 0 ? (
        <DetailFieldGrid title="补充信息" fields={supportingFields} columns={3} />
      ) : null}

      {extra}

      {arrayTables.map((table) => (
        <DetailSection
          key={table.key}
          title={table.title}
          description="记录内嵌的明细行（示例）"
        >
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((column) => (
                  <TableHead key={column}>{labelFor(column, labelMap)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, index) => (
                <TableRow key={`${table.key}-${index}`}>
                  {table.columns.map((column) => {
                    const cell = row[column]
                    return (
                      <TableCell
                        key={column}
                        className={
                          column === 'sku' || column === 'code' || column.endsWith('Id')
                            ? 'font-mono text-xs'
                            : typeof cell === 'number'
                              ? 'tabular-nums'
                              : undefined
                        }
                      >
                        {isScalar(cell) ? formatScalar(cell) : '—'}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
      ))}

      {timeline.length > 0 ? (
        <DetailSection title="状态时间线" description="按时间顺序保留各节点与操作记录">
          <ol className="flex flex-col gap-3 border-l pl-4">
            {timeline.map((event, index) => (
              <li key={`${event}-${index}`} className="text-sm">
                {event}
              </li>
            ))}
          </ol>
        </DetailSection>
      ) : null}

      {primaryPricing ? (
        <DetailFieldGrid
          title={primaryPricing.title}
          description={primaryPricing.description}
          fields={primaryPricing.fields}
          columns={3}
        />
      ) : null}

      {relatedSections.length > 0 ? (
        <DetailRelatedTables sections={relatedSections} />
      ) : null}

      {saved ? <p role="status" className="text-sm text-muted-foreground">{saved}</p> : null}

      {editing ? (
        <UedDialog
          title={`编辑 · ${moduleTitle}`}
          description="修改记录字段；保存仅作用于本次原型会话。"
          fields={editFields}
          initialValues={Object.fromEntries(fieldKeys.map((key) => [key, typeof current[key] === 'boolean' ? (current[key] ? '是' : '否') : String(current[key] ?? '')]))}
          onClose={() => setEditing(false)}
          onSave={(values) => {
            const next = { ...current }
            for (const [key, value] of Object.entries(values)) {
              const previous = current[key]
              next[key] =
                typeof previous === 'number'
                  ? Number(value || 0)
                  : typeof previous === 'boolean'
                    ? value === '是' || value === 'true'
                    : value
            }
            setCurrent(next)
            setEditing(false)
            setSaved(`${moduleTitle}记录已更新（原型会话，未写入数据库）。`)
          }}
          saveLabel="保存修改"
        />
      ) : null}
    </div>
  )
}
