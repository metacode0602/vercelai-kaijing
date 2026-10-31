'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  convertWithFx,
  importFxRatesMock,
  removeFxRate,
  upsertFxRate,
  useFxRates,
  type FxRateRow,
} from '@/lib/crossborder/fx-rate-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

export default function FxRatesSettingsPage() {
  const rows = useFxRates()
  const [notice, setNotice] = React.useState('')
  const [form, setForm] = React.useState({
    platform: 'Daraz',
    marketplace: 'Daraz LK',
    baseCurrency: 'USD',
    quoteCurrency: 'LKR',
    rate: '300',
    effectiveDate: '2026-10-31',
    source: 'manual',
    note: '',
  })

  const preview = React.useMemo(() => {
    const rate = Number(form.rate)
    if (!Number.isFinite(rate) || rate <= 0) return null
    const fake: FxRateRow = {
      id: 'preview',
      platform: form.platform,
      marketplace: form.marketplace,
      baseCurrency: form.baseCurrency,
      quoteCurrency: form.quoteCurrency,
      rate,
      effectiveDate: form.effectiveDate,
      source: form.source,
      note: form.note,
    }
    return convertWithFx(100, fake)
  }, [form])

  function save() {
    const rate = Number(form.rate)
    if (!Number.isFinite(rate) || rate <= 0) {
      setNotice('汇率必须为正数')
      return
    }
    const id = `FX-${form.platform.slice(0, 2).toUpperCase()}-${form.baseCurrency}-${form.quoteCurrency}-${form.effectiveDate}`
    upsertFxRate({
      id,
      platform: form.platform,
      marketplace: form.marketplace,
      baseCurrency: form.baseCurrency,
      quoteCurrency: form.quoteCurrency,
      rate,
      effectiveDate: form.effectiveDate,
      source: form.source,
      note: form.note || '手工维护',
    })
    setNotice(`已保存 ${id}（保留原币/汇率/折算三元组）`)
  }

  function mockImport() {
    importFxRatesMock([
      {
        id: `FX-DZ-USD-LKR-IMPORT-${Date.now().toString().slice(-6)}`,
        platform: 'Daraz',
        marketplace: 'Daraz LK',
        baseCurrency: 'USD',
        quoteCurrency: 'LKR',
        rate: 301.5,
        effectiveDate: '2026-10-31',
        source: 'import',
        note: 'mock CSV 导入',
      },
    ])
    setNotice('已 mock 导入 1 条汇率')
  }

  return (
    <UedWorkspace
      title="汇率配置"
      description="F33 · platform + 币种对 + 生效日 + 来源。历史不覆盖；消费方保留原币 / 汇率 / 折算金额。"
      rows={rows}
      searchKeys={['platform', 'marketplace', 'baseCurrency', 'quoteCurrency', 'source', 'effectiveDate']}
      searchPlaceholder="搜索平台、币种或来源"
      filters={[{ label: '平台', options: ['Daraz', 'Lazada'], key: 'platform' }]}
      columns={[
        { key: 'platform', label: '平台' },
        { key: 'marketplace', label: '站点' },
        {
          key: 'pair',
          label: '币种对',
          render: (row) => `${row.baseCurrency}/${row.quoteCurrency}`,
        },
        { key: 'rate', label: '汇率', render: (row) => String(row.rate) },
        { key: 'effectiveDate', label: '生效日' },
        {
          key: 'source',
          label: '来源',
          render: (row) => <Badge variant="secondary">{row.source}</Badge>,
        },
        { key: 'note', label: '备注' },
        {
          key: 'actions',
          label: '操作',
          render: (row) => (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                removeFxRate(row.id)
                setNotice(`已删除 ${row.id}`)
              }}
            >
              删除
            </Button>
          ),
        },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '汇率条数', value: String(rows.length) },
          { label: 'Daraz', value: String(rows.filter((r) => r.platform === 'Daraz').length) },
          { label: 'Lazada', value: String(rows.filter((r) => r.platform === 'Lazada').length) },
        ]}
      />
      <UedPrototypeNotice>
        审批人：杨洁 / 黄发聪（财务口径确认前仅原型）。不接真实汇率 API；import 为 mock。
      </UedPrototypeNotice>
      <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
        <div className="space-y-1">
          <Label>平台</Label>
          <Select value={form.platform} onValueChange={(value) => setForm((f) => ({ ...f, platform: value }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Daraz">Daraz</SelectItem>
              <SelectItem value="Lazada">Lazada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>站点</Label>
          <Input value={form.marketplace} onChange={(e) => setForm((f) => ({ ...f, marketplace: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>原币</Label>
          <Input value={form.baseCurrency} onChange={(e) => setForm((f) => ({ ...f, baseCurrency: e.target.value.toUpperCase() }))} />
        </div>
        <div className="space-y-1">
          <Label>折算币</Label>
          <Input value={form.quoteCurrency} onChange={(e) => setForm((f) => ({ ...f, quoteCurrency: e.target.value.toUpperCase() }))} />
        </div>
        <div className="space-y-1">
          <Label>汇率</Label>
          <Input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>生效日</Label>
          <Input type="date" value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>来源</Label>
          <Select value={form.source} onValueChange={(value) => setForm((f) => ({ ...f, source: value }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">manual</SelectItem>
              <SelectItem value="import">import</SelectItem>
              <SelectItem value="api">api</SelectItem>
              <SelectItem value="platform_bill">platform_bill</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>备注</Label>
          <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-4">
          <Button onClick={save}>保存汇率</Button>
          <Button variant="outline" onClick={mockImport}>
            mock 导入
          </Button>
          {preview ? (
            <span className="text-sm text-muted-foreground">
              预览三元组：原币 100 → 汇率 {preview.rate} → 折算 {preview.converted} {form.quoteCurrency}
            </span>
          ) : null}
        </div>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
