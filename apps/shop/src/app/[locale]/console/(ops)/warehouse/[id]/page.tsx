'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import {
  BALANCE_COLUMNS,
  BIN_BINDING_COLUMNS,
  BIN_COLUMNS,
  MOVEMENT_COLUMNS,
  buildUedRelatedInfo,
  mapBalanceRows,
  mapBinRows,
  mapMovementRows,
} from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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
import { Textarea } from '@workspace/ui/components/textarea'

function binVariant(status: string) {
  if (status === '占用') return 'secondary' as const
  if (status === '锁定' || status === '停用') return 'destructive' as const
  return 'outline' as const
}

function zoneVariant(status: string) {
  return status === '启用' ? ('secondary' as const) : ('outline' as const)
}

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  // Bin management state
  const [binAddOpen, setBinAddOpen] = React.useState(false)
  const [binEdit, setBinEdit] = React.useState<(typeof allBins)[number] | null>(null)
  const [binConfirm, setBinConfirm] = React.useState<
    { bin: (typeof allBins)[number]; action: 'enable' | 'disable'; reason: string } | null
  >(null)
  // Zone management state
  const [zoneConfirm, setZoneConfirm] = React.useState<
    { zone: (typeof allZones)[number]; action: 'enable' | 'disable' } | null
  >(null)
  const [zoneAddOpen, setZoneAddOpen] = React.useState(false)
  const [zoneEdit, setZoneEdit] = React.useState<(typeof allZones)[number] | null>(null)

  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100 })
  const binsQuery = trpc.wms.listBins.useQuery({ page: 1, pageSize: 100 })
  const zonesQuery = trpc.wms.listZones.useQuery({ page: 1, pageSize: 100 })

  const allBins = binsQuery.data?.items ?? []
  const allZones = zonesQuery.data?.items ?? []
  const warehouse =
    (warehousesQuery.data?.items ?? []).find((item) => item.id === id || item.code === id) ||
    undefined
  const bin = !warehouse
    ? allBins.find((item) => item.id === id || item.code === id)
    : undefined
  const resolvedWarehouseCode = warehouse?.code || bin?.warehouseCode
  const warehouseBins = allBins.filter((item) => item.warehouseCode === resolvedWarehouseCode)
  const warehouseZones = allZones.filter((item) => item.warehouseCode === resolvedWarehouseCode)

  const balancesQuery = trpc.wms.listBalances.useQuery(
    { page: 1, pageSize: 100, warehouse: resolvedWarehouseCode },
    { enabled: !!resolvedWarehouseCode },
  )
  const movementsQuery = trpc.wms.listMovements.useQuery(
    { page: 1, pageSize: 50, warehouse: resolvedWarehouseCode, sku: bin?.boundSku || undefined },
    { enabled: !!resolvedWarehouseCode },
  )
  const bindingsQuery = trpc.wms.listBinBindings.useQuery(
    { binId: bin?.id || '', page: 1, pageSize: 50 },
    { enabled: !!bin?.id },
  )

  const updateWarehouse = trpc.wms.updateWarehouse.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.wms.listWarehouses.invalidate(),
        utils.wms.getWarehouse.invalidate(),
      ])
      setEditOpen(false)
      setNotice('仓库已更新')
    },
    onError: (e) => setNotice(e.message),
  })
  const updateBin = trpc.wms.updateBin.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.wms.listBins.invalidate(),
        utils.wms.listWarehouses.invalidate(),
        utils.wms.listBinBindings.invalidate(),
        utils.wms.listZones.invalidate(),
        utils.wms.zoneStats.invalidate(),
      ])
      setEditOpen(false)
      setBinEdit(null)
      setBinConfirm(null)
      setNotice('库位已更新')
    },
    onError: (e) => setNotice(e.message),
  })
  const createBinMut = trpc.wms.createBin.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.wms.listBins.invalidate(),
        utils.wms.warehouseStats.invalidate(),
        utils.wms.listZones.invalidate(),
        utils.wms.zoneStats.invalidate(),
      ])
      setBinAddOpen(false)
      setNotice(`已创建库位 ${row.code}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const updateZoneMut = trpc.wms.updateZone.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.wms.listZones.invalidate(), utils.wms.zoneStats.invalidate()])
      setZoneConfirm(null)
      setZoneEdit(null)
      setNotice('库区已更新')
    },
    onError: (e) => setNotice(e.message),
  })
  const createZoneMut = trpc.wms.createZone.useMutation({
    onSuccess: async (row) => {
      await Promise.all([utils.wms.listZones.invalidate(), utils.wms.zoneStats.invalidate()])
      setZoneAddOpen(false)
      setNotice(`已创建库区 ${row.code}`)
    },
    onError: (e) => setNotice(e.message),
  })

  if (warehousesQuery.isLoading || binsQuery.isLoading || zonesQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse"
          title="加载中…"
          description="正在从数据库读取仓库 / 库位…"
        />
      </div>
    )
  }

  // Warehouse view
  if (warehouse) {
    const balances = balancesQuery.data?.items ?? []
    const related = buildUedRelatedInfo(
      'warehouse',
      { id: warehouse.id, warehouse: warehouse.code, warehouseCode: warehouse.code },
      {
        bins: mapBinRows(warehouseBins),
        balances: mapBalanceRows(balances),
        movements: mapMovementRows(movementsQuery.data?.items ?? []),
      },
    )

    return (
      <div className="flex w-full flex-col gap-4">
        <ConsoleBreadcrumbRegistration
          items={[
            { label: '仓库与库位', href: '/console/warehouse' },
            { label: `${warehouse.code} · ${warehouse.name}` },
          ]}
        />
        <DetailPageHeader
          backHref="/console/warehouse"
          title={`${warehouse.code} · ${warehouse.name}`}
          description={`${warehouse.type} · ${warehouse.country} · ${warehouse.timezone}`}
          badges={
            <>
              <Badge variant="outline">commerce_warehouses</Badge>
              <Badge variant={warehouse.status === '启用' ? 'secondary' : 'outline'}>
                {warehouse.status}
              </Badge>
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEditOpen(true)}>
                编辑仓库
              </Button>
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href="/console/warehouse-zones">库区管理</LocaleLink>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href="/console/inventory-balances">库存余额</LocaleLink>
              </Button>
            </div>
          }
        />
        <DetailKpiRow
          items={[
            { label: '库区数', value: String(warehouseZones.length) },
            { label: '库位数', value: String(warehouseBins.length) },
            {
              label: '占用',
              value: String(warehouseBins.filter((item) => item.status === '占用').length),
            },
            {
              label: '空闲',
              value: String(warehouseBins.filter((item) => item.status === '空闲').length),
            },
          ]}
        />
        <DetailFieldGrid
          title="仓库主信息"
          description="commerce_warehouses"
          fields={[
            { label: '仓库 ID', value: warehouse.id, mono: true },
            { label: '仓库编码', value: warehouse.code, mono: true },
            { label: '名称', value: warehouse.name },
            { label: '类型', value: warehouse.type },
            { label: '国家', value: warehouse.country },
            { label: '时区', value: warehouse.timezone },
            { label: '运营币种', value: warehouse.currency },
            { label: '地址', value: warehouse.address || '—' },
            { label: '备注', value: warehouse.note || '—' },
          ]}
        />
        <DetailSection
          title="库区管理"
          description="commerce_warehouse_zones · 新增/编辑弹窗，启用/停用需确认"
          action={
            <Button size="sm" onClick={() => setZoneAddOpen(true)}>
              新增库区
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>库区编码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>用途</TableHead>
                <TableHead>库位数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouseZones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-4 text-center text-sm text-muted-foreground">
                    该仓库下暂无库区
                  </TableCell>
                </TableRow>
              ) : (
                warehouseZones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="font-mono text-xs">{zone.code}</TableCell>
                    <TableCell>{zone.name}</TableCell>
                    <TableCell>{zone.purpose || '—'}</TableCell>
                    <TableCell>{zone.binCount}</TableCell>
                    <TableCell>
                      <Badge variant={zoneVariant(zone.status)}>{zone.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setZoneEdit(zone)}>
                          编辑
                        </Button>
                        {zone.status === '启用' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setZoneConfirm({ zone, action: 'disable' })}
                          >
                            停用
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setZoneConfirm({ zone, action: 'enable' })}
                          >
                            启用
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DetailSection>
        <DetailSection
          title="库位管理"
          description="commerce_bins · 新增/编辑弹窗，启用/停用需确认"
          action={
            <Button size="sm" onClick={() => setBinAddOpen(true)}>
              新增库位
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>库位编码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>库区</TableHead>
                <TableHead>绑定 SKU</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouseBins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-4 text-center text-sm text-muted-foreground">
                    该仓库下暂无库位
                  </TableCell>
                </TableRow>
              ) : (
                warehouseBins.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.zoneCode || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{item.boundSku || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={binVariant(item.status)}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setBinEdit(item)}>
                          编辑
                        </Button>
                        {item.status === '停用' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setBinConfirm({ bin: item, action: 'enable', reason: '' })}
                          >
                            启用
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setBinConfirm({ bin: item, action: 'disable', reason: '' })}
                          >
                            停用
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DetailSection>
        <DetailRelatedTables
          sections={(related.sections || []).filter(
            (section) => section.title !== '库位列表' && section.title !== '库位',
          )}
        />
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        {editOpen ? (
          <UedDialog
            title="编辑仓库"
            description="编码不可改；变更写入 commerce_warehouses。"
            fields={[
              { key: 'name', label: '名称', required: true, defaultValue: warehouse.name },
              { key: 'address', label: '地址', defaultValue: warehouse.address },
              { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: warehouse.note },
              {
                key: 'status',
                label: '状态',
                options: ['启用', '停用'],
                required: true,
                defaultValue: warehouse.status,
              },
            ]}
            onClose={() => setEditOpen(false)}
            onSave={(values) => {
              updateWarehouse.mutate({
                id: warehouse.id,
                name: values.name || warehouse.name,
                address: values.address || '',
                note: values.note || '',
                status: values.status === '停用' ? '停用' : '启用',
              })
            }}
            saveLabel="保存"
          />
        ) : null}
        {binAddOpen ? (
          <UedDialog
            title="新增库位"
            description={`归属仓库 ${warehouse.code}；写入 commerce_bins。`}
            fields={[
              { key: 'code', label: '库位编码', required: true, placeholder: '如 BIN-A-01' },
              { key: 'name', label: '库位名称', placeholder: '可留空，默认取编码' },
              {
                key: 'zoneCode',
                label: '库区编码',
                placeholder: '可留空',
                options: warehouseZones.map((zone) => zone.code),
              },
              { key: 'boundSku', label: '绑定内部 SKU', placeholder: '可留空' },
              { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
            ]}
            onClose={() => setBinAddOpen(false)}
            onSave={(values) => {
              createBinMut.mutate({
                warehouseCode: warehouse.code,
                code: values.code,
                zoneCode: values.zoneCode || undefined,
                name: values.name || undefined,
                boundSku: values.boundSku || undefined,
                note: values.note || undefined,
              })
            }}
            saveLabel="创建"
          />
        ) : null}
        {binEdit ? (
          <UedDialog
            title="编辑库位"
            description="换绑 SKU 前请确认无占用；停用后不可再用于入库/出库目标。"
            fields={[
              { key: 'name', label: '库位名称', defaultValue: binEdit.name, required: true },
              {
                key: 'zoneCode',
                label: '库区编码',
                defaultValue: binEdit.zoneCode,
                options: warehouseZones.map((zone) => zone.code),
              },
              { key: 'boundSku', label: '绑定内部 SKU', defaultValue: binEdit.boundSku },
              {
                key: 'status',
                label: '状态',
                options: ['空闲', '占用', '锁定', '停用'],
                defaultValue: binEdit.status,
                required: true,
              },
              {
                key: 'reason',
                label: '变更原因',
                type: 'textarea',
                fullWidth: true,
                placeholder: '解绑 / 换绑 / 停用必填；绑定可空',
              },
              { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: binEdit.note },
            ]}
            onClose={() => setBinEdit(null)}
            onSave={(values) => {
              updateBin.mutate({
                id: binEdit.id,
                name: values.name || binEdit.name,
                zoneCode: values.zoneCode || '',
                boundSku: values.boundSku || '',
                status: values.status || binEdit.status,
                reason: values.reason || '',
                note: values.note || '',
              })
            }}
            saveLabel="保存"
          />
        ) : null}
        {zoneAddOpen ? (
          <UedDialog
            title="新增库区"
            description={`归属仓库 ${warehouse.code}；写入 commerce_warehouse_zones。编码创建后不可改。`}
            fields={[
              { key: 'code', label: '库区编码', required: true, placeholder: '如 ZONE-D' },
              { key: 'name', label: '库区名称', placeholder: '可留空，默认取编码' },
              { key: 'purpose', label: '用途', placeholder: '如 存储 / 退货 / 拣货' },
              {
                key: 'status',
                label: '状态',
                options: ['启用', '停用'],
                defaultValue: '启用',
                required: true,
              },
              { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
            ]}
            onClose={() => setZoneAddOpen(false)}
            onSave={(values) => {
              createZoneMut.mutate({
                warehouseCode: warehouse.code,
                code: values.code,
                name: values.name || undefined,
                purpose: values.purpose || undefined,
                status: values.status === '停用' ? '停用' : '启用',
                note: values.note || undefined,
              })
            }}
            saveLabel="创建"
          />
        ) : null}
        {zoneEdit ? (
          <UedDialog
            title="编辑库区"
            description="编码创建后不可改；变更写入 commerce_warehouse_zones。"
            fields={[
              { key: 'name', label: '库区名称', defaultValue: zoneEdit.name, required: true },
              { key: 'purpose', label: '用途', defaultValue: zoneEdit.purpose },
              {
                key: 'status',
                label: '状态',
                options: ['启用', '停用'],
                defaultValue: zoneEdit.status,
                required: true,
              },
              { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: zoneEdit.note },
            ]}
            onClose={() => setZoneEdit(null)}
            onSave={(values) => {
              updateZoneMut.mutate({
                id: zoneEdit.id,
                name: values.name || zoneEdit.name,
                purpose: values.purpose || '',
                status: values.status === '停用' ? '停用' : '启用',
                note: values.note || '',
              })
            }}
            saveLabel="保存"
          />
        ) : null}
        {zoneConfirm ? (
          <AlertDialog open onOpenChange={(open) => !open && setZoneConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {zoneConfirm.action === 'disable' ? '确认停用库区' : '确认启用库区'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  库区 {zoneConfirm.zone.code} · {zoneConfirm.zone.name}
                  {zoneConfirm.action === 'disable'
                    ? '。停用后该库区下不可新增库位，已有库位仍保留。'
                    : '。启用后该库区可继续用于库位归属。'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    updateZoneMut.mutate({
                      id: zoneConfirm.zone.id,
                      status: zoneConfirm.action === 'disable' ? '停用' : '启用',
                    })
                  }
                >
                  确认
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {binConfirm ? (
          <AlertDialog open onOpenChange={(open) => !open && setBinConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {binConfirm.action === 'disable' ? '确认停用库位' : '确认启用库位'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  库位 {binConfirm.bin.code} · {binConfirm.bin.name}
                  {binConfirm.action === 'disable'
                    ? '。停用后该库位不可用于入库/出库目标，且会解除当前 SKU 绑定。请填写停用原因。'
                    : '。启用后该库位状态将置为「空闲」，可重新用于库位绑定。'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {binConfirm.action === 'disable' ? (
                <Textarea
                  placeholder="停用原因（必填）"
                  value={binConfirm.reason}
                  onChange={(e) =>
                    setBinConfirm((current) =>
                      current ? { ...current, reason: e.target.value } : null,
                    )
                  }
                />
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  disabled={binConfirm.action === 'disable' && !binConfirm.reason.trim()}
                  onClick={() => {
                    if (binConfirm.action === 'disable' && !binConfirm.reason.trim()) return
                    updateBin.mutate({
                      id: binConfirm.bin.id,
                      status: binConfirm.action === 'disable' ? '停用' : '空闲',
                      reason: binConfirm.reason,
                    })
                  }}
                >
                  确认
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    )
  }

  // Bin view
  if (!bin) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse"
          title="未找到库位 / 仓库"
          description={
            `编码 ${id} 不存在于 commerce_warehouses / commerce_bins。`
          }
        />
      </div>
    )
  }

  const balances = (balancesQuery.data?.items ?? []).filter(
    (item) => item.bin === bin.code && (!bin.boundSku || item.sku === bin.boundSku),
  )
  const movements = (movementsQuery.data?.items ?? []).filter((item) => item.bin === bin.code)
  const siblingBins = warehouseBins.filter((item) => item.id !== bin.id)

  const related = buildUedRelatedInfo(
    'warehouse',
    {
      id: bin.id,
      code: bin.code,
      warehouse: bin.warehouseCode,
      warehouseCode: bin.warehouseCode,
      boundSku: bin.boundSku,
      sku: bin.boundSku,
      zoneCode: bin.zoneCode,
    },
    {
      balances: mapBalanceRows(balances),
      movements: mapMovementRows(movements),
      bins: mapBinRows(siblingBins),
    },
  )
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '仓库与库位', href: '/console/warehouse' },
          { label: `${bin.warehouseCode} / ${bin.code}` },
        ]}
      />
      <DetailPageHeader
        backHref="/console/warehouse"
        title={bin.code}
        description={`${bin.warehouseCode} · ${bin.name} · 库区 ${bin.zoneCode || '—'}`}
        badges={
          <>
            <Badge variant="outline">commerce_bins</Badge>
            <Badge variant={binVariant(bin.status)}>{bin.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              编辑库位
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/warehouse/${encodeURIComponent(bin.warehouseId)}`}>
                所属仓库
              </LocaleLink>
            </Button>
            {bin.boundSku ? (
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink href={`/console/master-skus/${encodeURIComponent(bin.boundSku)}`}>
                  绑定 SKU
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <Alert>
        <AlertTitle>一库位一启用 SKU</AlertTitle>
        <AlertDescription>
          库位绑定与库存余额会随关联操作同步更新。
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '状态', value: bin.status },
          { label: '绑定 SKU', value: bin.boundSku || '—' },
          { label: '余额行', value: String(balances.length) },
          { label: '近期流水', value: String(movements.length) },
        ]}
      />
      <DetailFieldGrid
        title="库位主信息"
        description="commerce_bins"
        fields={[
          { label: '库位 ID', value: bin.id, mono: true },
          ...parentFields,
          { label: '库位编码', value: bin.code, mono: true },
          { label: '名称', value: bin.name },
          { label: '库区', value: bin.zoneCode || '—' },
          { label: '仓库', value: bin.warehouseCode, mono: true },
          { label: '绑定 SKU', value: bin.boundSku || '—' },
          { label: '备注', value: bin.note || '—' },
          { label: '更新时间', value: bin.updatedAt },
        ]}
      />
      <DetailRelatedTables
        sections={
          related.sections?.length
            ? related.sections
            : [
                {
                  title: '库位库存',
                  description: 'wms.listBalances',
                  columns: BALANCE_COLUMNS,
                  rows: mapBalanceRows(balances),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '库存流水',
                  description: 'wms.listMovements',
                  columns: MOVEMENT_COLUMNS,
                  rows: mapMovementRows(movements),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '同仓库位',
                  description: 'wms.listBins',
                  columns: BIN_COLUMNS,
                  rows: mapBinRows(siblingBins),
                  emptyText: '暂无关联数据',
                },
              ]
        }
      />
      <DetailRelatedTables
        sections={[
          {
            title: '绑定履历',
            description: 'bin_binding_history · 只读追加记录',
            columns: BIN_BINDING_COLUMNS,
            rows: bindingsQuery.data?.items ?? [],
            emptyText: bindingsQuery.isLoading ? '加载中…' : '暂无绑定履历',
          },
        ]}
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {editOpen ? (
        <UedDialog
          title="编辑库位"
          description="换绑 SKU 前请确认无占用；停用后不可再用于入库/出库目标。"
          fields={[
            { key: 'name', label: '库位名称', defaultValue: bin.name, required: true },
            { key: 'zoneCode', label: '库区编码', defaultValue: bin.zoneCode },
            { key: 'boundSku', label: '绑定内部 SKU', defaultValue: bin.boundSku },
            {
              key: 'status',
              label: '状态',
              options: ['空闲', '占用', '锁定', '停用'],
              defaultValue: bin.status,
              required: true,
            },
            {
              key: 'reason',
              label: '变更原因',
              type: 'textarea',
              fullWidth: true,
              placeholder: '解绑 / 换绑 / 停用必填；绑定可空',
            },
            { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: bin.note },
          ]}
          onClose={() => setEditOpen(false)}
          onSave={(values) => {
            updateBin.mutate({
              id: bin.id,
              name: values.name || bin.name,
              zoneCode: values.zoneCode || '',
              boundSku: values.boundSku || '',
              status: values.status || bin.status,
              reason: values.reason || '',
              note: values.note || '',
            })
          }}
          saveLabel="保存"
        />
      ) : null}
    </div>
  )
}
