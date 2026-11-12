'use client'

import * as React from 'react'
import { Pencil } from 'lucide-react'
import {
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
import { useConsoleBreadcrumbs } from '@/components/console/console-breadcrumbs-context'
import { UedDialog, type UedDialogField } from '@/components/console/erp-ued-workspace'
import { UED_RECORD_LABELS } from '@/lib/crossborder/erp-ued-labels'
import {
  buildPrimaryPricingFields,
  buildUedRelatedInfo,
  RELATED_PARENT_REPLACED_KEYS,
  resolveSkuFromRow,
} from '@/lib/console/related-info'
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
const IMAGE_KEYS = new Set(['coverImage', 'images', 'gallery', 'imageUrl'])

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function formatScalar(value: string | number | boolean) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
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
    if (key === timelineKey || IMAGE_KEYS.has(key) || !Array.isArray(value) || value.length === 0) continue
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
  headerActions,
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
  headerActions?: React.ReactNode
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

  const builtRelated = module ? buildUedRelatedInfo(module, current) : undefined
  const classified =
    relatedInfo ??
    (builtRelated &&
    ((builtRelated.parents?.length ?? 0) > 0 || (builtRelated.sections?.length ?? 0) > 0)
      ? builtRelated
      : undefined)

  // Scalar keys replaced by navigable parent fields in 主数据 (avoid duplicate plain text).
  const parentReplacedKeys = new Set<string>(
    classified?.parents?.length && module ? (RELATED_PARENT_REPLACED_KEYS[module] ?? []) : [],
  )

  const fieldKeys = Object.keys(current).filter((key) => {
    const value = current[key]
    return isScalar(value) && key !== timelineKey && !parentReplacedKeys.has(key) && !IMAGE_KEYS.has(key)
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
      : module === 'costs'
        ? new Set(['components', 'shippingOptions'])
        : module === 'finance'
          ? new Set(['settlement'])
          : new Set<string>()
  const arrayTables = collectArrayTables(current, labelMap, timelineKey).filter(
    (table) => !skipArrayKeys.has(table.key),
  )

  const timeline = timelineKey && Array.isArray(current[timelineKey]) ? (current[timelineKey] as unknown[]).map(String) : []
  const relatedGroups = related ?? []
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

  const noticeText = notice ?? '无关联数据时显示「暂无关联数据」或「待接入」。'
  useConsoleBreadcrumbs([
    { label: moduleTitle, href: backHref },
    { label: String(title) },
  ])

  return (
    <div className="flex w-full flex-col gap-4">
      <DetailPageHeader
        backHref={backHref}
        title={title}
        description={description ?? subtitle}
        badges={
          <>
            
            {typeof current.status === 'string' ? (
              <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
            ) : null}
          </>
        }
        actions={
          <>
            {headerActions}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" />
              编辑详情
            </Button>
          </>
        }
      />

      <Alert>
        <AlertTitle>详情关联</AlertTitle>
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
          description="记录内嵌的明细行"
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
          description="修改记录字段；保存仅作用于当前页面会话，不会写入数据库。"
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
            setSaved(`${moduleTitle}记录已更新（未写入数据库）。`)
          }}
          saveLabel="保存修改"
        />
      ) : null}
    </div>
  )
}
