'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  BIN_STATUSES,
  getWarehouse,
  listBalancesForSku,
  listBinsForWarehouse,
  listLedgerForBin,
  toRelatedBinShape,
  updateBin,
  updateWarehouse,
  useBins,
  useInventoryBalances,
  useInventoryLedger,
  useWarehouses,
} from '@/lib/crossborder/wms-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function binVariant(status: string) {
  if (status === '占用') return 'secondary' as const
  if (status === '锁定' || status === '停用') return 'destructive' as const
  return 'outline' as const
}

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const warehouses = useWarehouses()
  const bins = useBins()
  useInventoryBalances()
  useInventoryLedger()
  const [mounted, setMounted] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const bin = bins.find((item) => item.code === id || item.id === id)
  const warehouse = bin
    ? getWarehouse(bin.warehouseCode)
    : warehouses.find((item) => item.code === id || item.id === id)

  // 仓库主档详情（当 id 是仓库编码且不是库位）
  if (!bin && warehouse) {
    const warehouseBins = listBinsForWarehouse(warehouse.code)
    return (
      <div className="flex w-full flex-col gap-4">
        <ConsoleBreadcrumbRegistration
          items={[{ label: '仓库与库位', href: '/console/warehouse' }, { label: warehouse.code }]}
        />
        <DetailPageHeader
          backHref="/console/warehouse"
          title={warehouse.name}
          description={`${warehouse.code} · ${warehouse.type}`}
          badges={
            <>
              <Badge variant="outline">示例数据</Badge>
              <Badge variant={warehouse.status === '启用' ? 'secondary' : 'outline'}>
                {warehouse.status}
              </Badge>
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const result = updateWarehouse(warehouse.code, {
                    status: warehouse.status === '启用' ? '停用' : '启用',
                  })
                  setNotice(result.ok ? `仓库已${result.warehouse.status}` : result.reason)
                }}
              >
                {warehouse.status === '启用' ? '停用仓库' : '启用仓库'}
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink href="/console/inventory-balances">库存余额</LocaleLink>
              </Button>
            </div>
          }
        />
        <DetailKpiRow
          items={[
            { label: '库位数', value: String(warehouseBins.length) },
            { label: '占用', value: String(warehouseBins.filter((item) => item.status === '占用').length) },
            { label: '关联店铺', value: String(warehouse.shops.length) },
            { label: '币种', value: warehouse.currency },
          ]}
        />
        <DetailFieldGrid
          title="仓库主信息"
          description="commerce_warehouses"
          fields={[
            { label: '仓库编码', value: warehouse.code, mono: true },
            { label: '名称', value: warehouse.name },
            { label: '类型', value: warehouse.type },
            { label: '国家', value: warehouse.country },
            { label: '时区', value: warehouse.timezone },
            { label: '运营币种', value: warehouse.currency },
            { label: '地址', value: warehouse.address || '—' },
            { label: '关联店铺', value: warehouse.shops.join('、') || '—' },
            { label: '备注', value: warehouse.note || '—' },
          ]}
        />
        <DetailRelatedTables
          sections={[
            {
              title: '库位',
              description: '本仓库下 commerce_bins',
              columns: [
                { key: 'code', label: '库位', mono: true, hrefKey: 'href' },
                { key: 'zoneCode', label: '库区' },
                { key: 'boundSku', label: '绑定 SKU', mono: true },
                { key: 'status', label: '状态' },
              ],
              rows: warehouseBins.map((item) => ({
                code: item.code,
                zoneCode: item.zoneCode,
                boundSku: item.boundSku || '—',
                status: item.status,
                href: `/console/warehouse/${encodeURIComponent(item.code)}`,
              })),
              emptyText: '暂无库位',
            },
          ]}
        />
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </div>
    )
  }

  if (!bin) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse"
          title={mounted ? '未找到库位 / 仓库' : '加载中…'}
          description={
            mounted
              ? `编码 ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话…'
          }
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('warehouse', toRelatedBinShape(bin) as Record<string, unknown>)
  const parentFields = parentsToFields(related.parents)
  const balances = bin.boundSku ? listBalancesForSku(bin.boundSku).filter((item) => item.bin === bin.code) : []
  const ledger = listLedgerForBin(bin.warehouseCode, bin.code).slice(0, 8)

  const editor = editOpen ? (
    <UedDialog
      title="编辑库位"
      description="换绑 SKU 前请确认无占用；停用后不可再用于入库/出库目标。"
      fields={[
        { key: 'name', label: '库位名称', defaultValue: bin.name, required: true },
        { key: 'zoneCode', label: '库区编码', defaultValue: bin.zoneCode, required: true },
        {
          key: 'boundSku',
          label: '绑定内部 SKU',
          options: ['不绑定', 'HSY000001001', 'HSY000001002', 'HSY000002001'],
          defaultValue: bin.boundSku || '不绑定',
          required: true,
        },
        {
          key: 'status',
          label: '状态',
          options: [...BIN_STATUSES],
          defaultValue: bin.status,
          required: true,
        },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: bin.note },
      ]}
      onClose={() => setEditOpen(false)}
      onSave={(values) => {
        const result = updateBin(bin.id, {
          name: values.name,
          zoneCode: values.zoneCode,
          boundSku: values.boundSku,
          status: values.status as (typeof BIN_STATUSES)[number],
          note: values.note,
        })
        setEditOpen(false)
        setNotice(result.ok ? '库位已更新。' : result.reason)
      }}
      saveLabel="保存"
    />
  ) : null

  return (
    <div className="flex w-full flex-col gap-4">
      {editor}
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '仓库与库位', href: '/console/warehouse' },
          { label: bin.warehouseCode, href: `/console/warehouse/${encodeURIComponent(bin.warehouseCode)}` },
          { label: bin.code },
        ]}
      />
      <DetailPageHeader
        backHref="/console/warehouse"
        title={bin.code}
        description={`${bin.warehouseCode} · 库区 ${bin.zoneCode}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={binVariant(bin.status)}>{bin.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              编辑库位
            </Button>
            {bin.boundSku ? (
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink
                  href={`/console/inventory-balances/${encodeURIComponent(`${bin.warehouseCode}-${bin.code}-${bin.boundSku}`)}`}
                >
                  查看余额
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <Alert>
        <AlertTitle>一库位一启用 SKU（R07）</AlertTitle>
        <AlertDescription>
          有实物或预留占用时，库位不可绑定其他启用 SKU。清空占用后可解绑或换绑；历史流水保留。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        库位是库存物理坐标。入库上架、出库拣货、盘点调整均需选择本仓库下可用库位。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '绑定 SKU', value: bin.boundSku || '—' },
          { label: '账面', value: balances[0] ? String(balances[0].onHand) : '0' },
          { label: '可用', value: balances[0] ? String(balances[0].available) : '0' },
          { label: '状态', value: bin.status },
        ]}
      />
      <DetailFieldGrid
        title="库位主信息"
        description="commerce_bins"
        fields={[
          { label: '库位编码', value: bin.code, mono: true },
          ...parentFields,
          { label: '仓库', value: bin.warehouseCode, mono: true },
          { label: '库区', value: bin.zoneCode },
          { label: '名称', value: bin.name },
          { label: '绑定 SKU', value: bin.boundSku || '—' },
          { label: '状态', value: bin.status },
          { label: '备注', value: bin.note || '—' },
        ]}
      />
      <DetailRelatedTables
        sections={[
          ...(related.sections || []),
          {
            title: '库存余额',
            description: '本库位当前余额投影',
            columns: [
              { key: 'sku', label: 'SKU', mono: true },
              { key: 'onHand', label: '账面', numeric: true },
              { key: 'reserved', label: '预留', numeric: true },
              { key: 'available', label: '可用', numeric: true },
              { key: 'status', label: '状态' },
            ],
            rows: balances.map((item) => ({
              sku: item.sku,
              onHand: item.onHand,
              reserved: item.reserved,
              available: item.available,
              status: item.status,
            })),
            emptyText: '本库位暂无余额',
          },
          {
            title: '近期流水',
            description: 'inventory_ledger（追加式）',
            columns: [
              { key: 'id', label: '流水号', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'delta', label: '变化' },
              { key: 'after', label: '变动后', numeric: true },
              { key: 'at', label: '时间' },
            ],
            rows: ledger.map((item) => ({
              id: item.id,
              type: item.type,
              delta: String(item.onHandAfter - item.onHandBefore),
              after: item.onHandAfter,
              at: item.occurredAt,
              href: `/console/inventory-ledger/${encodeURIComponent(item.id)}`,
            })),
            emptyText: '暂无流水',
          },
        ]}
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
