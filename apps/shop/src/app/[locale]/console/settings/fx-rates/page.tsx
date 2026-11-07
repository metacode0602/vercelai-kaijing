'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { convertWithFx } from '@/lib/settings/fx-rate-rules'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import * as XLSX from 'xlsx'

type FxFormValues = {
  platform: string
  marketplaceCode: string
  baseCurrency: string
  quoteCurrency: string
  rate: string
  effectiveDate: string
  source: string
  note: string
}

const emptyForm = (): FxFormValues => ({
  platform: 'Daraz',
  marketplaceCode: 'Daraz LK',
  baseCurrency: 'USD',
  quoteCurrency: 'LKR',
  rate: '300',
  effectiveDate: new Date().toISOString().slice(0, 10),
  source: 'manual',
  note: '',
})

const FORM_FIELDS = [
  { key: 'platform', label: '平台', options: ['Daraz', 'Lazada'], required: true },
  { key: 'marketplaceCode', label: '站点', required: true },
  { key: 'baseCurrency', label: '原币', required: true, placeholder: 'USD' },
  { key: 'quoteCurrency', label: '折算币', required: true, placeholder: 'LKR' },
  { key: 'rate', label: '汇率', required: true },
  { key: 'effectiveDate', label: '生效日', type: 'date', required: true },
  {
    key: 'source',
    label: '来源',
    options: ['manual', 'import', 'api', 'platform_bill'],
    required: true,
  },
  { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
]

function pickCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

export default function FxRatesSettingsPage() {
  const utils = trpc.useUtils()
  const [includeDisabled, setIncludeDisabled] = React.useState(false)
  const listQuery = trpc.fxRates.list.useQuery({ page: 1, pageSize: 100, includeDisabled })
  const meta = trpc.fxRates.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const [notice, setNotice] = React.useState('')
  const [dialog, setDialog] = React.useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [initial, setInitial] = React.useState<FxFormValues>(emptyForm())
  const fileRef = React.useRef<HTMLInputElement>(null)

  const createMutation = trpc.fxRates.create.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      setNotice(`已保存 ${row?.baseCurrency}/${row?.quoteCurrency} @ ${row?.rate}（fx_rates）`)
      await utils.fxRates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const updateMutation = trpc.fxRates.update.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      setEditingId(null)
      setNotice(`已更新 ${row?.baseCurrency}/${row?.quoteCurrency} @ ${row?.rate}`)
      await utils.fxRates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const setActive = trpc.fxRates.setActive.useMutation({
    onSuccess: async (row) => {
      setNotice(`${row?.id} 已${row?.status === '停用' ? '停用' : '启用'}（软操作，历史保留）`)
      await utils.fxRates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const importMutation = trpc.fxRates.importRows.useMutation({
    onSuccess: async (res) => {
      setNotice(
        `${res.note}${
          res.errors.length
            ? ` 示例失败：第 ${res.errors[0]?.index} 行 ${res.errors[0]?.message}`
            : ''
        }`,
      )
      await utils.fxRates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  function openCreate() {
    setEditingId(null)
    setInitial(emptyForm())
    setDialog('create')
  }

  function openEdit(row: (typeof rows)[number]) {
    setEditingId(row.id)
    setInitial({
      platform: row.platform || 'Daraz',
      marketplaceCode: row.marketplaceCode || '',
      baseCurrency: row.baseCurrency,
      quoteCurrency: row.quoteCurrency,
      rate: String(row.rate),
      effectiveDate: row.effectiveDate,
      source: row.source || 'manual',
      note: row.note || '',
    })
    setDialog('edit')
  }

  function saveForm(values: Record<string, string>) {
    const payload = {
      platform: values.platform,
      marketplaceCode: values.marketplaceCode,
      baseCurrency: (values.baseCurrency || '').toUpperCase(),
      quoteCurrency: (values.quoteCurrency || '').toUpperCase(),
      rate: values.rate,
      effectiveDate: values.effectiveDate,
      source: values.source || 'manual',
      note: values.note || '',
    }
    if (dialog === 'edit' && editingId) {
      updateMutation.mutate({ id: editingId, ...payload })
      return
    }
    createMutation.mutate(payload)
  }

  async function onImportFile(file: File) {
    setNotice('正在解析 Excel…')
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        setNotice('Excel 无工作表')
        return
      }
      const sheet = workbook.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!raw.length) {
        setNotice('Excel 无数据行')
        return
      }
      const mapped = raw.map((row) => ({
        platform: pickCell(row, ['platform', '平台']),
        marketplaceCode: pickCell(row, ['marketplaceCode', 'marketplace', '站点']),
        baseCurrency: pickCell(row, ['baseCurrency', '原币', 'base']),
        quoteCurrency: pickCell(row, ['quoteCurrency', '折算币', 'quote']),
        rate: pickCell(row, ['rate', '汇率']),
        effectiveDate: pickCell(row, ['effectiveDate', '生效日', 'date']),
        note: pickCell(row, ['note', '备注']),
      }))
      const valid = mapped.filter((r) => r.baseCurrency && r.quoteCurrency && r.rate && r.effectiveDate)
      if (!valid.length) {
        setNotice('没有可导入的有效行（需 baseCurrency/quoteCurrency/rate/effectiveDate）')
        return
      }
      importMutation.mutate({ rows: valid })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '解析 Excel 失败')
    }
  }

  const previewRate = Number(initial.rate)
  const preview =
    Number.isFinite(previewRate) && previewRate > 0
      ? (() => {
          try {
            return convertWithFx(100, previewRate)
          } catch {
            return null
          }
        })()
      : null

  const editor =
    dialog === null ? null : (
      <UedDialog
        title={dialog === 'create' ? '添加汇率' : '编辑汇率'}
        description="写入 fx_rates；历史行软停用，不硬删。"
        fields={FORM_FIELDS}
        initialValues={initial}
        onClose={() => {
          setDialog(null)
          setEditingId(null)
        }}
        onSave={saveForm}
        saveLabel={
          createMutation.isPending || updateMutation.isPending
            ? '保存中…'
            : dialog === 'create'
              ? '创建'
              : '保存'
        }
      >
        {preview ? (
          <p className="text-sm text-muted-foreground">
            预览：原币 100 → 汇率 {preview.rate} → 折算 {preview.converted}
          </p>
        ) : null}
      </UedDialog>
    )

  return (
    <>
      {editor}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onImportFile(file)
        }}
      />
      <UedWorkspace
        title="汇率配置"
        description="F33 · 列表 / 编辑 / 添加弹窗；支持 Excel 导入。落库 fx_rates；历史软停用，不硬删。"
        rows={rows}
        searchKeys={['platform', 'marketplace', 'baseCurrency', 'quoteCurrency', 'source', 'effectiveDate', 'note']}
        searchPlaceholder="搜索平台、币种或来源"
        filters={[{ label: '平台', options: ['Daraz', 'Lazada'], key: 'platform' }]}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无汇率。点击「添加」或「导入 Excel」写入组织隔离的 fx_rates。'}
        addLabel="添加"
        onAdd={openCreate}
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
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
          { key: 'note', label: '备注' },
          {
            key: 'actions',
            label: '操作',
            render: (row) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate({ id: row.id, active: row.status !== '启用' })}
                >
                  {row.status === '启用' ? '停用' : '启用'}
                </Button>
              </div>
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
          {meta.data?.note || '已接库；Excel 列：platform / marketplaceCode / baseCurrency / quoteCurrency / rate / effectiveDate / note。'}
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={includeDisabled ? 'secondary' : 'outline'}
            onClick={() => setIncludeDisabled((v) => !v)}
          >
            {includeDisabled ? '隐藏已停用' : '显示已停用'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={importMutation.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {importMutation.isPending ? '导入中…' : '导入 Excel'}
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
