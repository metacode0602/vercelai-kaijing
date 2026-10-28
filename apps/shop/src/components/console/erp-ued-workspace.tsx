'use client'

import * as React from 'react'
import { Check, ChevronRight, Download, Plus, Search, X } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'

export type UedColumn<T> = { key: keyof T | string; label: string; render?: (row: T) => React.ReactNode }

export function UedWorkspace<T>(props: {
  title: string
  description: string
  rows: T[]
  columns: UedColumn<T>[]
  searchKeys?: Array<keyof T | string>
  searchPlaceholder?: string
  filters?: Array<{ label: string; options: string[] }>
  onAdd?: () => void
  addLabel?: string
  onExport?: () => void
  emptyText?: string
  children?: React.ReactNode
}) {
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState('全部')
  const [detailRow, setDetailRow] = React.useState<T | null>(null)
  const searchKeys = props.searchKeys ?? ['id', 'code', 'spu', 'sku', 'name', 'status']
  const rows = props.rows.filter((row) => {
    const record = row as Record<string, unknown>
    const searchable = searchKeys.map((key) => String(record[String(key)] ?? '')).join(' ').toLowerCase()
    return searchable.includes(query.toLowerCase()) && (filter === '全部' || String(record.status ?? '') === filter)
  })

  function exportDemoRows() {
    const headers = props.columns.map((column) => column.label)
    const body = rows.map((row) => props.columns.map((column) => {
      const record = row as Record<string, unknown>
      const value = record[String(column.key)]
      return String(value ?? '').replaceAll('"', '""')
    }))
    const csv = [headers, ...body].map((line) => line.map((value) => `"${value}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${props.title}-示例.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold tracking-tight">{props.title}</h1><p className="mt-1 text-sm text-muted-foreground">{props.description}</p></div><div className="flex gap-2"><Button variant="outline" onClick={props.onExport ?? exportDemoRows}><Download data-icon="inline-start" />导出演示清单</Button>{props.onAdd ? <Button onClick={props.onAdd}><Plus data-icon="inline-start" />{props.addLabel ?? '新增'}</Button> : null}</div></header>
    {props.children}
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={props.searchPlaceholder ?? '搜索编码、名称或状态'} className="pl-9" /></div><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{rows.length} 条示例</span>{props.filters?.length ? <NativeSelect value={filter} onChange={(event) => setFilter(event.target.value)} className="w-40"><NativeSelectOption value="全部">全部状态</NativeSelectOption>{props.filters.flatMap((item) => item.options).map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect> : null}<Badge variant="outline">示例数据</Badge></div></div>
    <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow>{props.columns.map((column) => <TableHead key={String(column.key)}>{column.label}</TableHead>)}<TableHead className="w-24 text-right">详情</TableHead></TableRow></TableHeader><TableBody>{rows.map((row, index) => { const record = row as Record<string, unknown>; return <TableRow key={String(record.id ?? record.code ?? record.spu ?? record.sku ?? index)}>{props.columns.map((column) => <TableCell key={String(column.key)}>{column.render ? column.render(row) : String(record[String(column.key)] ?? '—')}</TableCell>)}<TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setDetailRow(row)}>查看<ChevronRight data-icon="inline-end" /></Button></TableCell></TableRow>})}{rows.length === 0 ? (<TableRow><TableCell colSpan={props.columns.length + 1} className="h-24 text-center text-muted-foreground">{props.emptyText ?? '没有匹配数据。清除筛选或新增记录。'}</TableCell></TableRow>) : null}</TableBody></Table></div>
    {detailRow ? <div className="fixed inset-0 z-50 flex justify-end bg-background/60" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRow(null) }} onKeyDown={(event) => { if (event.key === 'Escape') setDetailRow(null) }}><aside role="dialog" aria-modal="true" aria-labelledby="ued-detail-title" className="flex h-full w-full max-w-xl flex-col border-l bg-background shadow-xl"><header className="flex items-start justify-between gap-3 border-b p-5"><div><h2 id="ued-detail-title" className="font-semibold">记录详情</h2><p className="mt-1 text-sm text-muted-foreground">示例数据 · 只在本次原型会话中查看</p></div><Button variant="ghost" size="icon-sm" aria-label="关闭详情" onClick={() => setDetailRow(null)}><X /></Button></header><dl className="grid flex-1 content-start grid-cols-[minmax(120px,0.8fr)_minmax(0,1.4fr)] overflow-y-auto">{props.columns.map((column) => { const record = detailRow as Record<string, unknown>; const value = column.render ? column.render(detailRow) : String(record[String(column.key)] ?? '—'); return <React.Fragment key={String(column.key)}><dt className="border-b px-5 py-3 text-sm text-muted-foreground">{column.label}</dt><dd className="border-b px-5 py-3 text-sm">{value}</dd></React.Fragment>})}</dl><footer className="flex flex-wrap justify-end gap-2 border-t p-4"><Button variant="outline" onClick={() => setDetailRow(null)}>关闭</Button></footer></aside></div> : null}
  </section>
}

export function UedDialog(props: { title: string; description: string; fields: Array<{ label: string; placeholder?: string; options?: string[]; type?: string }>; onClose: () => void; onSave: () => void; saveLabel?: string }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }} onKeyDown={(event) => { if (event.key === 'Escape') props.onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="ued-dialog-title" className="w-full max-w-xl rounded-xl border bg-background p-5 shadow-lg"><header className="mb-5"><h2 id="ued-dialog-title" className="font-semibold">{props.title}</h2><p className="mt-1 text-sm text-muted-foreground">{props.description}</p></header><div className="grid gap-4 sm:grid-cols-2">{props.fields.map((field) => <div key={field.label} className="flex flex-col gap-2"><Label>{field.label}</Label>{field.options ? <NativeSelect defaultValue={field.options[0]}>{field.options.map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect> : <Input type={field.type ?? 'text'} placeholder={field.placeholder} />}</div>)}</div><footer className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={props.onClose}>取消</Button><Button onClick={props.onSave}><Check data-icon="inline-start" />{props.saveLabel ?? '保存示例'}</Button></footer></section></div>
}

export function UedPrototypeNotice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{children}</p>
}
