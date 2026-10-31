'use client'

import * as React from 'react'
import { Check, ChevronDown, CircleHelp, Plus, Search, X } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import {
  INITIAL_COUNTRIES,
  INITIAL_CURRENCIES,
  INITIAL_PLATFORMS,
  INITIAL_WAREHOUSES,
  type CountryRecord,
  type CurrencyRecord,
  type PlatformRecord,
  type WarehouseRecord,
} from '@/lib/crossborder/platform-basics-data'

type Tab = 'platforms' | 'countries' | 'warehouses' | 'currencies'
type RecordValue = PlatformRecord | CountryRecord | WarehouseRecord | CurrencyRecord
type FieldSpec = { key: string; label: string; placeholder?: string; type?: 'text' | 'number' | 'select'; options?: string[]; readOnly?: boolean; hint?: string }

const tabs: { key: Tab; label: string }[] = [
  { key: 'platforms', label: '平台' },
  { key: 'countries', label: '国家 / 站点' },
  { key: 'warehouses', label: '仓库' },
  { key: 'currencies', label: '币种' },
]

const emptyValues: Record<Tab, Record<string, string>> = {
  platforms: { code: '', name: '', status: 'active', countries: '', apiReady: 'Configuration required' },
  countries: { code: '', name: '', region: '', timezone: '', defaultCurrency: 'CNY', status: 'active' },
  warehouses: { code: '', name: '', type: '自营仓', country: 'CN', timezone: 'Asia/Shanghai', currency: 'CNY', status: 'active', shops: '' },
  currencies: { code: '', name: '', symbol: '', decimals: '2', status: 'active' },
}

const fieldSpecs: Record<Tab, FieldSpec[]> = {
  platforms: [
    { key: 'code', label: '平台代码', placeholder: '如 lazada' },
    { key: 'name', label: '平台名称', placeholder: '如 Lazada' },
    { key: 'countries', label: '支持站点', placeholder: '国家代码用逗号分隔，如 MY, PH, SG' },
    { key: 'apiReady', label: '接入状态', type: 'select', options: ['Configuration required', 'Connected', 'Planned'], readOnly: true, hint: '由平台运营维护，租户只读' },
  ],
  countries: [
    { key: 'code', label: '国家代码', placeholder: 'ISO 3166-1，如 MY' },
    { key: 'name', label: '国家名称', placeholder: '如 马来西亚' },
    { key: 'region', label: '所属区域', placeholder: '如 东南亚' },
    { key: 'timezone', label: '时区', placeholder: 'IANA 时区，如 Asia/Kuala_Lumpur' },
    { key: 'defaultCurrency', label: '默认币种', type: 'select', options: INITIAL_CURRENCIES.map((item) => item.code) },
  ],
  warehouses: [
    { key: 'code', label: '仓库代码', placeholder: '全局唯一，如 WH-CN-XMN-001' },
    { key: 'name', label: '仓库名称', placeholder: '易识别的名称' },
    { key: 'type', label: '仓库类型', type: 'select', options: ['自营仓', '3PL 仓', '供应商仓'] },
    { key: 'country', label: '所在国家', type: 'select', options: INITIAL_COUNTRIES.map((item) => item.code) },
    { key: 'timezone', label: '仓库时区', placeholder: '自动带出国家默认值，可调整' },
    { key: 'currency', label: '核算币种', type: 'select', options: INITIAL_CURRENCIES.map((item) => item.code) },
    { key: 'shops', label: '可选店铺', placeholder: '逗号分隔；空白表示可供所有店铺选择' },
  ],
  currencies: [
    { key: 'code', label: '币种代码', placeholder: 'ISO 4217，如 CNY' },
    { key: 'name', label: '币种名称', placeholder: '如 人民币' },
    { key: 'symbol', label: '符号', placeholder: '如 ¥' },
    { key: 'decimals', label: '小数位', type: 'number', placeholder: '如 2' },
  ],
}

const columns: Record<Tab, { key: string; label: string }[]> = {
  platforms: [{ key: 'name', label: '平台' }, { key: 'code', label: '代码' }, { key: 'countries', label: '已配置站点' }, { key: 'apiReady', label: '接入状态' }, { key: 'status', label: '状态' }],
  countries: [{ key: 'name', label: '国家 / 站点' }, { key: 'code', label: '代码' }, { key: 'region', label: '区域' }, { key: 'timezone', label: '时区' }, { key: 'defaultCurrency', label: '默认币种' }, { key: 'status', label: '状态' }],
  warehouses: [{ key: 'name', label: '仓库' }, { key: 'code', label: '仓库代码' }, { key: 'type', label: '类型' }, { key: 'country', label: '国家' }, { key: 'currency', label: '核算币种' }, { key: 'shops', label: '可选店铺' }, { key: 'status', label: '状态' }],
  currencies: [{ key: 'code', label: '代码' }, { key: 'name', label: '币种' }, { key: 'symbol', label: '符号' }, { key: 'decimals', label: '小数位' }, { key: 'status', label: '状态' }],
}

function rowsFor(tab: Tab, state: { platforms: PlatformRecord[]; countries: CountryRecord[]; warehouses: WarehouseRecord[]; currencies: CurrencyRecord[] }): RecordValue[] {
  return state[tab]
}

function normalizeValue(tab: Tab, values: Record<string, string>): RecordValue {
  if (tab === 'platforms') return { ...values, countries: values.countries.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean) } as PlatformRecord
  if (tab === 'countries') return { ...values, code: values.code.toUpperCase() } as CountryRecord
  if (tab === 'warehouses') return { ...values, country: values.country.toUpperCase(), shops: values.shops.split(',').map((value) => value.trim()).filter(Boolean) } as WarehouseRecord
  return { ...values, code: values.code.toUpperCase(), decimals: Number(values.decimals || 0) } as CurrencyRecord
}

export default function PlatformBasicsPage() {
  const [activeTab, setActiveTab] = React.useState<Tab>('platforms')
  const [data, setData] = React.useState({ platforms: INITIAL_PLATFORMS, countries: INITIAL_COUNTRIES, warehouses: INITIAL_WAREHOUSES, currencies: INITIAL_CURRENCIES })
  const [query, setQuery] = React.useState('')
  const [dialog, setDialog] = React.useState<{ tab: Tab; key: string | null } | null>(null)
  const [values, setValues] = React.useState<Record<string, string>>({ ...emptyValues.platforms })
  const [inactiveRecords, setInactiveRecords] = React.useState<Record<Tab, string[]>>({ platforms: [], countries: [], warehouses: [], currencies: [] })
  const [showInactive, setShowInactive] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const rows = rowsFor(activeTab, data).filter((row) => (showInactive || !inactiveRecords[activeTab].includes(row.code)) && Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()))
  const { pagedRows, pagination } = useConsolePagination(rows)
  const openCreate = () => { setValues({ ...emptyValues[activeTab] }); setDialog({ tab: activeTab, key: null }) }
  const openEdit = (row: RecordValue) => {
    const next = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]))
    setValues(next)
    setDialog({ tab: activeTab, key: row.code })
  }

  function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog) return
    const record = normalizeValue(dialog.tab, values)
    const duplicate = data[dialog.tab].some((item) => item.code.toLowerCase() === record.code.toLowerCase() && item.code !== dialog.key)
    if (duplicate) {
      setNotice('该代码已存在，请使用唯一代码。')
      return
    }
    setData((current) => {
      const nextRows = [...current[dialog.tab]]
      const index = dialog.key ? nextRows.findIndex((item) => item.code === dialog.key) : -1
      if (index >= 0) nextRows[index] = record as never
      else nextRows.push(record as never)
      return { ...current, [dialog.tab]: nextRows }
    })
    setDialog(null)
    setNotice('已保存到本次原型会话。刷新页面后将恢复示例数据。')
  }

  function toggleStatus(row: RecordValue) {
    if (row.status === 'active') {
      setInactiveRecords((current) => ({ ...current, [activeTab]: [...current[activeTab], row.code] }))
      setNotice('资料已停用，不再作为新建默认项；历史记录保留。')
      return
    }
    setInactiveRecords((current) => ({ ...current, [activeTab]: current[activeTab].filter((code) => code !== row.code) }))
    setData((current) => ({
      ...current,
      [activeTab]: current[activeTab].map((item) => item.code === row.code ? { ...item, status: item.status === 'active' ? 'inactive' : 'active' } as never : item),
    }))
    setNotice('资料已重新启用到本次原型会话。')
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">平台基础资料</h1>
          <p className="text-sm text-muted-foreground">店铺配置时复用国家、币种与仓库资料</p>
        </div>
          <Button onClick={openCreate}><Plus data-icon="inline-start" />新增{tabs.find((tab) => tab.key === activeTab)?.label}</Button>
      </header>

      <div className="flex flex-wrap items-center gap-1 border-b">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" onClick={() => { setActiveTab(tab.key); setQuery(''); pagination.onPageChange(1) }} className={`border-b-2 px-3 py-2 text-sm transition-colors ${activeTab === tab.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`} aria-current={activeTab === tab.key ? 'page' : undefined}>
            {tab.label}<span className="ml-2 text-xs text-muted-foreground">{data[tab.key].length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => { setQuery(event.target.value); pagination.onPageChange(1) }} placeholder="搜索名称或代码" className="pl-9" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>{rows.length} 条{showInactive ? '记录' : '启用记录'}</span>{inactiveRecords[activeTab].length > 0 ? <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowInactive((current) => !current)}>{showInactive ? '隐藏' : '查看'}停用 ({inactiveRecords[activeTab].length})</Button> : null}<Badge variant="outline">示例数据</Badge></div>
      </div>

      <ConsoleListSection
        title={`${tabs.find((tab) => tab.key === activeTab)?.label}列表`}
        description={`共 ${rows.length} 条${showInactive ? '记录' : '启用记录'}`}
        pagination={pagination}
      >
        <Table>
          <TableHeader><TableRow>{columns[activeTab].map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}<TableHead className="w-32 text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {pagedRows.map((row) => (
              <TableRow key={row.code}>
                {columns[activeTab].map((column) => {
                  const value = row[column.key as keyof RecordValue]
                  const display = Array.isArray(value) ? value.join(', ') : String(value ?? '—')
                  return <TableCell key={column.key} className={['code', 'timezone'].includes(column.key) ? 'font-mono text-xs' : ''}>{column.key === 'status' ? <Badge variant={value === 'active' ? 'secondary' : 'outline'}>{value === 'active' ? '启用' : '停用'}</Badge> : display}</TableCell>
                })}
                <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(row)}>编辑</Button><Button variant="ghost" size="sm" onClick={() => toggleStatus(row)}>{row.status === 'active' ? '停用' : '启用'}</Button></div></TableCell>
              </TableRow>
            ))}
        {rows.length === 0 ? <TableRow><TableCell colSpan={columns[activeTab].length + 1} className="h-24 text-center text-muted-foreground">{showInactive && inactiveRecords[activeTab].length > 0 ? '没有停用记录。' : '没有匹配记录。清除搜索条件或新增资料。'}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </ConsoleListSection>

      <details className="group rounded-lg border px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" />配置说明</summary>
        <div className="mt-3 grid gap-3 border-t pt-3 text-sm text-muted-foreground md:grid-cols-3">
          <p>平台 → 国家站点 → 店铺：店铺选择平台后，只展示该平台支持的站点。</p>
          <p>国家 → 默认币种与时区：创建店铺或仓库时自动带出，可按业务覆盖。</p>
          <p>停用代替删除：已被店铺、商品或单据引用的基础资料保留历史并停止新选用。</p>
          <p>平台接入状态由平台运营维护，租户只读；租户不能自行修改 Connected / Planned。</p>
        </div>
      </details>

      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }} onKeyDown={(event) => { if (event.key === 'Escape') setDialog(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="record-dialog-title" className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-lg">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="record-dialog-title" className="font-semibold">{dialog.key ? '编辑' : '新增'}{tabs.find((tab) => tab.key === dialog.tab)?.label}</h2><p className="mt-1 text-sm text-muted-foreground">保存后可在店铺配置中复用</p></div><Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => setDialog(null)}><X /></Button></div>
            <form onSubmit={saveRecord} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {fieldSpecs[dialog.tab].map((field) => (
                  <div key={field.key} className="flex flex-col gap-2">
                    <Label htmlFor={`record-${field.key}`}>{field.label}</Label>
                    {field.type === 'select' ? <NativeSelect id={`record-${field.key}`} value={values[field.key] ?? ''} disabled={field.readOnly} onChange={(event) => {
                      const value = event.target.value
                      setValues((current) => {
                        if (dialog.tab === 'countries' && field.key === 'defaultCurrency') return { ...current, defaultCurrency: value }
                        if (dialog.tab === 'warehouses' && field.key === 'country') {
                          const country = INITIAL_COUNTRIES.find((item) => item.code === value)
                          return { ...current, country: value, timezone: country?.timezone ?? current.timezone, currency: country?.defaultCurrency ?? current.currency }
                        }
                        return { ...current, [field.key]: value }
                      })
                    }}><NativeSelectOption value="">请选择</NativeSelectOption>{field.options?.map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect> : <Input id={`record-${field.key}`} type={field.type ?? 'text'} placeholder={field.placeholder} value={values[field.key] ?? ''} disabled={field.readOnly} required={field.key !== 'symbol'} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />}
                    {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
                    {dialog.tab === 'warehouses' && field.key === 'country' ? <p className="text-xs text-muted-foreground">选择国家后自动带出时区和核算币种。</p> : null}
                    {dialog.tab === 'warehouses' && field.key === 'shops' ? <p className="text-xs text-muted-foreground">一个仓库可供多个店铺选择；店铺也可关联多个仓库。</p> : null}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t pt-4"><CircleHelp className="size-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">代码创建后保持稳定；如已被业务数据引用，请停用而不要删除。</p></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>取消</Button><Button type="submit"><Check data-icon="inline-start" />保存资料</Button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
