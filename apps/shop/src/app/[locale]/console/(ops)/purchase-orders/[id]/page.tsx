'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import {
  addPurchaseOrderLine,
  updatePurchaseOrderHeader,
  updatePurchaseOrderStatus,
  usePurchaseOrders,
  type PurchaseOrderStatus,
} from '@/lib/crossborder/purchase-order-store'
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

const SKU_OPTIONS = ['HSY000001001', 'HSY000001002', 'HSY000002001']
const SUPPLIER_OPTIONS = ['厦门优品服饰有限公司', '泉州联创数码配件厂']
const WAREHOUSE_OPTIONS = ['WH-CN-XMN-001']

function statusVariant(status: string) {
  if (status === '已收货' || status === '已关闭') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const orders = usePurchaseOrders()
  const order = orders.find((item) => item.id === id)

  const [lineOpen, setLineOpen] = React.useState(false)
  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!order) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-orders"
          title={mounted ? '未找到采购单' : '加载采购单…'}
          description={
            mounted
              ? `采购单 ${id} 不存在，或仅存在于其他浏览器会话的示例数据中。`
              : '正在读取本机原型会话中的采购单…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或新建采购单主信息后再添加明细。
        </p>
      </div>
    )
  }

  const current = order
  const canEditLines = current.status === '草稿' || current.status === '已下发'

  function advance(status: PurchaseOrderStatus) {
    updatePurchaseOrderStatus(orders, current.id, status)
    setNotice(`${current.poNo} 已推进为「${status}」（原型会话）。`)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[{ label: '采购单', href: '/console/purchase-orders' }, { label: current.poNo }]}
      />

      <DetailPageHeader
        backHref="/console/purchase-orders"
        title={current.poNo}
        description={`采购单主信息 · ${current.supplier}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setHeaderOpen(true)}>
              编辑主信息
            </Button>
            {canEditLines ? (
              <Button size="sm" onClick={() => setLineOpen(true)}>
                添加采购明细
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertTitle>两步创建 · 对齐 purchase_orders / purchase_order_lines</AlertTitle>
        <AlertDescription>
          上方主信息对应表头；下方明细对应行表。新建时先保存主信息，再在本页追加具体采购信息，不要求一次填完。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.lines.length === 0
          ? '当前尚无采购明细。请点击「添加采购明细」写入 purchase_order_lines（variant_id / qty_ordered / unit_price）。'
          : '明细行金额汇总写入主信息 total_amount；到货数量投影字段 qty_received / qty_qc_passed / qty_stocked 由收货与质检回写。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行数', value: String(current.lines.length) },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          {
            label: '订购数量',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyOrdered, 0)),
          },
          {
            label: '已到货',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyReceived, 0)),
          },
        ]}
      />

      <DetailFieldGrid
        title="主信息"
        description="purchase_orders：供应商、仓库、币种、预计到货等表头字段"
        fields={[
          { label: '采购单号', value: current.poNo, mono: true },
          { label: '来源申请', value: current.sourceRequest, mono: true },
          { label: '供应商', value: current.supplier },
          { label: '收货仓库', value: current.warehouse, mono: true },
          { label: '币种', value: current.currency },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          { label: '预计到货', value: current.expectedAt },
          { label: '创建日期', value: current.createdAt },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
        ]}
        columns={3}
        action={
          <Button size="sm" variant="ghost" onClick={() => setHeaderOpen(true)}>
            编辑
          </Button>
        }
      />

      <DetailSection
        title="采购明细"
        description="purchase_order_lines：内部 SKU、订购数量、锁定单价与到货投影"
        action={
          canEditLines ? (
            <Button size="sm" variant="outline" onClick={() => setLineOpen(true)}>
              添加采购明细
            </Button>
          ) : null
        }
      >
        {current.lines.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              主信息已保存，明细为空。第二步在此添加具体采购信息，无需回到列表重填表头。
            </p>
            {canEditLines ? (
              <Button size="sm" onClick={() => setLineOpen(true)}>
                添加第一条明细
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>行号</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead className="text-right">订购数量</TableHead>
                <TableHead className="text-right">已到货</TableHead>
                <TableHead className="text-right">质检合格</TableHead>
                <TableHead className="text-right">已入库</TableHead>
                <TableHead className="text-right">单价</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="tabular-nums">{line.lineNo}</TableCell>
                  <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyOrdered}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyReceived}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyQcPassed}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyStocked}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.unitPrice} {current.currency}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.amount} {current.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      <div className="flex flex-wrap gap-2">
        {current.status === '草稿' ? (
          <Button
            size="sm"
            onClick={() => {
              if (current.lines.length === 0) {
                setNotice('请先添加至少一条采购明细，再下发给供应商（原型校验）。')
                return
              }
              advance('已下发')
            }}
          >
            下发采购单
          </Button>
        ) : null}
        {current.status === '已下发' ? (
          <Button size="sm" variant="outline" onClick={() => advance('部分到货')}>
            登记部分到货
          </Button>
        ) : null}
        {current.status === '部分到货' ? (
          <Button size="sm" onClick={() => advance('已收货')}>
            确认收货完成
          </Button>
        ) : null}
        {current.status === '草稿' || current.status === '已下发' ? (
          <Button size="sm" variant="ghost" onClick={() => advance('已取消')}>
            取消采购单
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {headerOpen ? (
        <UedDialog
          title="编辑主信息"
          description="仅修改 purchase_orders 表头字段；明细行在下方单独维护。"
          fields={[
            {
              key: 'sourceRequest',
              label: '来源申请',
              defaultValue: current.sourceRequest,
              required: true,
            },
            {
              key: 'supplier',
              label: '供应商',
              options: SUPPLIER_OPTIONS,
              defaultValue: current.supplier,
              required: true,
            },
            {
              key: 'warehouse',
              label: '收货仓库',
              options: WAREHOUSE_OPTIONS,
              defaultValue: current.warehouse,
              required: true,
            },
            {
              key: 'currency',
              label: '币种',
              options: ['CNY', 'USD'],
              defaultValue: current.currency,
              required: true,
            },
            {
              key: 'expectedAt',
              label: '预计到货',
              type: 'date',
              defaultValue: current.expectedAt,
              required: true,
            },
          ]}
          initialValues={{
            sourceRequest: current.sourceRequest,
            supplier: current.supplier,
            warehouse: current.warehouse,
            currency: current.currency,
            expectedAt: current.expectedAt,
          }}
          onClose={() => setHeaderOpen(false)}
          onSave={(values) => {
            updatePurchaseOrderHeader(orders, current.id, {
              sourceRequest: values.sourceRequest || current.sourceRequest,
              supplier: values.supplier || current.supplier,
              warehouse: values.warehouse || current.warehouse,
              currency: values.currency || current.currency,
              expectedAt: values.expectedAt || current.expectedAt,
            })
            setHeaderOpen(false)
            setNotice('主信息已更新（原型会话，未写入数据库）。')
          }}
          saveLabel="保存主信息"
        />
      ) : null}

      {lineOpen ? (
        <UedDialog
          title="添加采购明细"
          description="写入 purchase_order_lines：variant_id、qty_ordered、unit_price；金额自动计算。"
          fields={[
            { key: 'sku', label: '内部 SKU', options: SKU_OPTIONS, required: true, helper: '对应 variant_id' },
            {
              key: 'qtyOrdered',
              label: '订购数量',
              type: 'number',
              required: true,
              defaultValue: '1',
              helper: '对应 qty_ordered',
            },
            {
              key: 'unitPrice',
              label: '锁定单价',
              type: 'number',
              required: true,
              defaultValue: '28',
              helper: '对应 unit_price',
            },
          ]}
          onClose={() => setLineOpen(false)}
          onSave={(values) => {
            const updated = addPurchaseOrderLine(orders, current.id, {
              sku: values.sku || SKU_OPTIONS[0]!,
              qtyOrdered: Number(values.qtyOrdered || 1),
              unitPrice: Number(values.unitPrice || 0),
            })
            setLineOpen(false)
            setNotice(
              updated
                ? `已添加明细行 #${updated.lines.length}（${values.sku} × ${values.qtyOrdered}），合计 ${updated.totalAmount} ${updated.currency}。`
                : '添加明细失败（原型）。',
            )
          }}
          saveLabel="保存明细行"
        />
      ) : null}
    </div>
  )
}
