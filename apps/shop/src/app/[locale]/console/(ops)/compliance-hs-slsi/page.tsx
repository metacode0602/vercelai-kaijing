'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { HS_SLSI_SEED, type HsSlsiRow } from '@/lib/crossborder/daraz-ops-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'

export default function ComplianceHsSlsiPage() {
  const [rows, setRows] = React.useState<HsSlsiRow[]>(HS_SLSI_SEED)
  const [hsQuery, setHsQuery] = React.useState('8516.31')
  const [skuDraft, setSkuDraft] = React.useState({ sku: 'HDY-220', hsCode: '8516.31' })
  const [notice, setNotice] = React.useState('')

  const hit = rows.find((r) => r.hsCode === hsQuery)

  function mockImportChecklist() {
    const next: HsSlsiRow = {
      id: `HS-IMP-${Date.now().toString().slice(-4)}`,
      hsCode: '8414.51',
      description: '风扇 / 换气扇',
      slsiRequired: true,
      certName: 'SLSI 强制认证（示例导入）',
      blockListing: true,
      source: 'mock-import',
    }
    setRows((prev) => [next, ...prev])
    setNotice(`已导入 SLSI 清单行 ${next.hsCode}`)
  }

  function tryCreateMaster() {
    const rule = rows.find((r) => r.hsCode === skuDraft.hsCode)
    if (rule?.blockListing && rule.slsiRequired) {
      setNotice(
        `建档已阻断：HS ${skuDraft.hsCode} 命中 SLSI「${rule.certName}」。请先上传证书或更换 HS（审批：杨洁/黄发聪）。`,
      )
      return
    }
    setNotice(`原型：SKU ${skuDraft.sku} 可继续建档（未命中强制认证）。`)
  }

  return (
    <UedWorkspace
      title="HS 查询与 SLSI 认证"
      description="F31 · HS 编码查询 + SLSI 强制认证清单。命中强制项时阻断商品建档。"
      rows={rows}
      searchKeys={['hsCode', 'description', 'certName']}
      searchPlaceholder="搜索 HS / 描述"
      columns={[
        { key: 'hsCode', label: 'HS' },
        { key: 'description', label: '描述' },
        {
          key: 'slsiRequired',
          label: 'SLSI 强制',
          render: (r) => (r.slsiRequired ? <Badge variant="destructive">是</Badge> : <Badge variant="secondary">否</Badge>),
        },
        { key: 'certName', label: '证书' },
        {
          key: 'blockListing',
          label: '阻断建档',
          render: (r) => (r.blockListing ? '是' : '否'),
        },
        { key: 'source', label: '来源' },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '清单行', value: String(rows.length) },
          { label: '强制认证', value: String(rows.filter((r) => r.slsiRequired).length) },
          { label: '阻断规则', value: String(rows.filter((r) => r.blockListing).length) },
        ]}
      />
      <UedPrototypeNotice>
        外部合规库接口属 P2（Q44）。本页 import 为 mock；正式证书附件与审批流待确认。
      </UedPrototypeNotice>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">HS 查询</h3>
          <div className="flex gap-2">
            <Input value={hsQuery} onChange={(e) => setHsQuery(e.target.value)} placeholder="如 8516.31" />
            <Button variant="outline" onClick={() => setNotice(hit ? `命中：${hit.description}` : '未命中清单')}>
              查询
            </Button>
          </div>
          {hit ? (
            <p className="text-sm text-muted-foreground">
              {hit.description} · SLSI {hit.slsiRequired ? '强制' : '非强制'} · {hit.certName}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">当前输入未命中种子清单</p>
          )}
          <Button size="sm" variant="secondary" onClick={mockImportChecklist}>
            导入 SLSI 清单（mock）
          </Button>
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">建档阻断试算</h3>
          <div className="space-y-1">
            <Label>SKU</Label>
            <Input value={skuDraft.sku} onChange={(e) => setSkuDraft((s) => ({ ...s, sku: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>HS</Label>
            <Input value={skuDraft.hsCode} onChange={(e) => setSkuDraft((s) => ({ ...s, hsCode: e.target.value }))} />
          </div>
          <Button onClick={tryCreateMaster}>尝试建档</Button>
        </div>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
