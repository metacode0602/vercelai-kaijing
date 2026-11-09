'use client'

import * as React from 'react'
import { Check, ChevronRight, Plus, Search } from 'lucide-react'
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
import { Checkbox } from '@workspace/ui/components/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { LocaleLink } from '@/lib/i18n/navigation'
import { ConsoleListSection, ConsoleTableEmpty } from '@/components/console/list'

export type UedColumn<T> = {
  key: keyof T | string
  label: string
  render?: (row: T) => React.ReactNode
  /** 列级响应式类名，例如 `hidden md:table-cell` 在小屏隐藏次要素列。 */
  className?: string
}

const DEFAULT_PAGE_SIZE = 10

export function UedWorkspace<T>(props: {
  title: string
  description: string
  rows: T[]
  columns: UedColumn<T>[]
  searchKeys?: Array<keyof T | string>
  searchPlaceholder?: string
  filters?: Array<{ label: string; options: string[]; key?: string }>
  onAdd?: () => void
  addLabel?: string
  emptyText?: string
  detailHref?: (row: T) => string
  listTitle?: string
  listDescription?: string
  pagination?: {
    page: number
    pageSize: number
    total?: number
    onPageChange: (page: number) => void
  }
  /** 服务端分页时由父组件控制搜索词 */
  search?: string
  onSearchChange?: (value: string) => void
  onStatusFilterChange?: (value: string) => void
  children?: React.ReactNode
}) {
  const [internalQuery, setInternalQuery] = React.useState('')
  const query = props.search ?? internalQuery
  const [internalPage, setInternalPage] = React.useState(1)
  const filterDefs = props.filters ?? []
  const [filterValues, setFilterValues] = React.useState<Record<number, string>>({})
  const searchKeys = props.searchKeys ?? ['id', 'code', 'spu', 'sku', 'name', 'status']
  /** 传入 pagination.total 时视为服务端分页：不再本地 filter/slice，避免二次分页。 */
  const serverPaged = typeof props.pagination?.total === 'number'
  const rows = serverPaged
    ? props.rows
    : props.rows.filter((row) => {
        const record = row as Record<string, unknown>
        const searchable = searchKeys
          .map((key) => String(record[String(key)] ?? ''))
          .join(' ')
          .toLowerCase()
        if (!searchable.includes(query.toLowerCase())) return false
        return filterDefs.every((item, index) => {
          const selected = filterValues[index] ?? '全部'
          if (selected === '全部') return true
          const filterKey = item.key ?? 'status'
          return String(record[filterKey] ?? record.status ?? '') === selected
        })
      })

  const pageSize = Math.max(1, props.pagination?.pageSize ?? DEFAULT_PAGE_SIZE)
  const total = props.pagination?.total ?? rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = props.pagination
    ? Math.min(Math.max(1, props.pagination.page), pageCount)
    : Math.min(Math.max(1, internalPage), pageCount)
  const visibleRows = serverPaged ? rows : rows.slice((page - 1) * pageSize, page * pageSize)
  const onPageChange = props.pagination?.onPageChange ?? setInternalPage

  function updateQuery(value: string) {
    if (props.onSearchChange) props.onSearchChange(value)
    else setInternalQuery(value)
    onPageChange(1)
  }

  function updateFilter(index: number, value: string) {
    setFilterValues((current) => ({ ...current, [index]: value }))
    const def = filterDefs[index]
    if (def && (def.key ?? 'status') === 'status' && props.onStatusFilterChange) {
      props.onStatusFilterChange(value)
    }
    onPageChange(1)
  }

  const tableNode =
    rows.length === 0 ? (
      <ConsoleTableEmpty
        description={props.emptyText ?? '没有匹配数据。清除筛选或新增记录。'}
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            {props.columns.map((column) => (
              <TableHead key={String(column.key)} className={column.className}>
                {column.label}
              </TableHead>
            ))}
            {props.detailHref ? <TableHead className="w-24 text-right">详情</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, index) => {
            const record = row as Record<string, unknown>
            return (
              <TableRow key={String(record.id ?? record.code ?? record.spu ?? record.sku ?? index)}>
                {props.columns.map((column) => (
                  <TableCell key={String(column.key)} className={column.className}>
                    {column.render ? column.render(row) : String(record[String(column.key)] ?? '—')}
                  </TableCell>
                ))}
                {props.detailHref ? (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <LocaleLink href={props.detailHref(row)}>
                        查看
                        <ChevronRight data-icon="inline-end" />
                      </LocaleLink>
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )

  const tableCard = (
    <ConsoleListSection
      title={props.listTitle ?? `${props.title}列表`}
      description={props.listDescription ?? `共 ${total} 条`}
      pagination={{
        page,
        pageSize,
        total,
        onPageChange,
      }}
    >
      {tableNode}
    </ConsoleListSection>
  )

  return (
    <section className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.onAdd ? (
            <Button onClick={props.onAdd}>
              <Plus data-icon="inline-start" />
              {props.addLabel ?? '新增'}
            </Button>
          ) : null}
        </div>
      </header>
      {props.children}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={props.searchPlaceholder ?? '搜索编码、名称或状态'}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {filterDefs.map((item, index) => (
            <Select
              key={`${item.label}-${index}`}
              value={filterValues[index] ?? '全部'}
              onValueChange={(value) => updateFilter(index, value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部{item.label}</SelectItem>
                {item.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      </div>
      {tableCard}
    </section>
  )
}

export type UedOption = string | { value: string; title: string }

export type UedDialogField = {
  key?: string
  label: string
  placeholder?: string
  options?: UedOption[]
  /** 普通 select；设 searchable / type=search-select 时支持按名称模糊筛选 */
  type?: string
  searchable?: boolean
  /** 多选：值以 JSON 字符串数组写入 onSave（如 '["黑色","白色"]'） */
  multiple?: boolean
  required?: boolean
  helper?: string
  defaultValue?: string
  readOnly?: boolean
  fullWidth?: boolean
}

function normalizeOption(option: UedOption): { value: string; title: string } {
  return typeof option === 'string' ? { value: option, title: option } : option
}

function uniqueOptions(options: UedOption[]): Array<{ value: string; title: string }> {
  const seen = new Set<string>()
  const result: Array<{ value: string; title: string }> = []
  for (const option of options) {
    const normalized = normalizeOption(option)
    if (seen.has(normalized.value)) continue
    seen.add(normalized.value)
    result.push(normalized)
  }
  return result
}

/** 解析 UedDialog 多选字段值 */
export function parseUedMultiValue(raw: string | undefined | null): string[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((item) => String(item).trim()).filter(Boolean)))
    }
  } catch {
    // fall through — 兼容逗号分隔
  }
  return Array.from(
    new Set(
      raw
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function encodeUedMultiValue(values: string[]): string {
  return JSON.stringify(Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))))
}

function UedMultiSelect(props: {
  id: string
  values: string[]
  options: UedOption[]
  disabled?: boolean
  searchable?: boolean
  placeholder?: string
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = React.useState('')
  const options = React.useMemo(() => uniqueOptions(props.options), [props.options])
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) =>
      `${option.value} ${option.title}`.toLowerCase().includes(q),
    )
  }, [options, query])
  const selected = new Set(props.values)

  const toggle = (option: string) => {
    if (props.disabled) return
    const next = selected.has(option)
      ? props.values.filter((item) => item !== option)
      : [...props.values, option]
    props.onChange(next)
  }

  return (
    <div className="rounded-md border">
      {props.searchable ? (
        <div className="border-b p-2">
          <Input
            id={props.id}
            value={query}
            placeholder={props.placeholder ?? '输入关键词筛选…'}
            disabled={props.disabled}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>已选 {props.values.length} / {options.length}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="hover:text-foreground"
            disabled={props.disabled || filtered.length === 0}
            onClick={() => {
              const merged = Array.from(new Set([...props.values, ...filtered.map((option) => option.value)]))
              props.onChange(merged)
            }}
          >
            全选当前
          </button>
          <button
            type="button"
            className="hover:text-foreground"
            disabled={props.disabled || props.values.length === 0}
            onClick={() => props.onChange([])}
          >
            清空
          </button>
        </div>
      </div>
      <ul className="max-h-40 overflow-auto p-2" role="listbox" aria-multiselectable="true">
        {filtered.length === 0 ? (
          <li className="px-1 py-2 text-sm text-muted-foreground">无匹配项</li>
        ) : (
          filtered.map((option) => {
            const checked = selected.has(option.value)
            return (
              <li key={option.value || '__empty__'}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/60">
                  <Checkbox
                    checked={checked}
                    disabled={props.disabled}
                    onCheckedChange={() => toggle(option.value)}
                  />
                  <span>{option.title || '（空）'}</span>
                </label>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

function UedSearchableSelect(props: {
  id: string
  value: string
  options: UedOption[]
  placeholder?: string
  disabled?: boolean
  onChange: (next: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const options = React.useMemo(() => uniqueOptions(props.options), [props.options])
  const selectedTitle = options.find((option) => option.value === props.value)?.title ?? props.value
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) =>
      `${option.value} ${option.title}`.toLowerCase().includes(q),
    )
  }, [options, query])

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <div className="relative">
      <Input
        id={props.id}
        value={open ? query : selectedTitle}
        placeholder={props.placeholder ?? '输入关键词筛选…'}
        disabled={props.disabled}
        autoComplete="off"
        onFocus={() => {
          if (props.disabled) return
          setQuery(selectedTitle)
          setOpen(true)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          // 延迟关闭，便于点击选项
          window.setTimeout(() => setOpen(false), 120)
        }}
      />
      {open && !props.disabled ? (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-background py-1 shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">无匹配项</li>
          ) : (
            filtered.map((option) => (
              <li key={option.value || '__empty__'} role="option" aria-selected={option.value === props.value}>
                <button
                  type="button"
                  className={`flex w-full px-3 py-1.5 text-left text-sm hover:bg-muted ${option.value === props.value ? 'bg-muted/70' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    props.onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.title || '（不限）'}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

export function UedDialog(props: {
  title: string
  description: string
  fields: UedDialogField[]
  onClose: () => void
  onSave: (values: Record<string, string>) => void
  saveLabel?: string
  initialValues?: Record<string, string>
  children?: React.ReactNode
}) {
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of props.fields) {
      const key = field.key ?? field.label
      const firstOption = field.options?.[0] ? normalizeOption(field.options[0]).value : ''
      if (field.multiple) {
        initial[key] = props.initialValues?.[key] ?? field.defaultValue ?? '[]'
      } else {
        initial[key] = props.initialValues?.[key] ?? field.defaultValue ?? firstOption
      }
    }
    return initial
  })

  // 异步 options（如供应商列表）到达后补默认值
  const optionsSignature = props.fields
    .map(
      (field) =>
        `${field.key ?? field.label}:${uniqueOptions(field.options ?? [])
          .map((option) => `${option.value}:${option.title}`)
          .join('|')}`,
    )
    .join('||')
  React.useEffect(() => {
    setValues((current) => {
      let changed = false
      const next = { ...current }
      for (const field of props.fields) {
        const key = field.key ?? field.label
        const preferred = props.initialValues?.[key] ?? field.defaultValue
        if (field.multiple) {
          if (!(next[key] ?? '').trim() || next[key] === '[]') {
            if (preferred) {
              next[key] = preferred
              changed = true
            }
          }
          continue
        }
        const fieldOptions = uniqueOptions(field.options ?? [])
        if (!(next[key] ?? '').trim()) {
          if (preferred && (!fieldOptions.length || fieldOptions.some((option) => option.value === preferred))) {
            next[key] = preferred
            changed = true
          } else if (fieldOptions[0]) {
            next[key] = fieldOptions[0].value
            changed = true
          }
        }
      }
      return changed ? next : current
    })
  }, [optionsSignature, props.fields, props.initialValues])

  const missing = props.fields.some((field) => {
    const raw = values[field.key ?? field.label] ?? ''
    if (!field.required) return false
    if (field.multiple) return parseUedMultiValue(raw).length === 0
    return !raw.trim()
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }} onKeyDown={(event) => { if (event.key === 'Escape') props.onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="ued-dialog-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
        <header className="border-b p-5"><h2 id="ued-dialog-title" className="font-semibold">{props.title}</h2><p className="mt-1 text-sm text-muted-foreground">{props.description}</p></header>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (!missing) props.onSave(values) }}>
          <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
            {props.fields.map((field) => {
              const key = field.key ?? field.label
              const value = values[key] ?? ''
              const setValue = (next: string) => setValues((current) => ({ ...current, [key]: next }))
              const searchable = Boolean(field.searchable || field.type === 'search-select')
              const options = field.options ? uniqueOptions(field.options) : undefined
              const isMulti = Boolean(field.multiple && options)
              const multiValues = isMulti ? parseUedMultiValue(value) : []
              return (
                <div key={key} className={field.fullWidth || isMulti ? 'flex flex-col gap-2 sm:col-span-2' : 'flex flex-col gap-2'}>
                  <Label htmlFor={`ued-field-${key}`}>{field.label}{field.required ? <span className="text-destructive">*</span> : null}</Label>
                  {isMulti && options ? (
                    <UedMultiSelect
                      id={`ued-field-${key}`}
                      values={multiValues}
                      options={options}
                      searchable={searchable}
                      placeholder={field.placeholder}
                      disabled={field.readOnly}
                      onChange={(next) => setValue(encodeUedMultiValue(next))}
                    />
                  ) : options && searchable ? (
                    <UedSearchableSelect
                      id={`ued-field-${key}`}
                      value={value}
                      options={options}
                      placeholder={field.placeholder}
                      disabled={field.readOnly}
                      onChange={setValue}
                    />
                  ) : options ? (
                    <Select value={value === '' ? '__empty__' : value} onValueChange={(next) => setValue(next === '__empty__' ? '' : next)} disabled={field.readOnly}>
                      <SelectTrigger id={`ued-field-${key}`}>
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => <SelectItem key={option.value || '__empty__'} value={option.value || '__empty__'}>{option.title || '（不限）'}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'textarea' ? (
                    <textarea id={`ued-field-${key}`} value={value} onChange={(event) => setValue(event.target.value)} placeholder={field.placeholder} readOnly={field.readOnly} required={field.required} rows={3} className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" />
                  ) : (
                    <Input id={`ued-field-${key}`} type={field.type ?? 'text'} value={value} onChange={(event) => setValue(event.target.value)} placeholder={field.placeholder} readOnly={field.readOnly} required={field.required} disabled={field.readOnly} />
                  )}
                  {field.helper ? <p className="text-xs text-muted-foreground">{field.helper}</p> : null}
                </div>
              )
            })}
            {props.children ? <div className="flex flex-col gap-4 sm:col-span-2">{props.children}</div> : null}
          </div>
          <footer className="flex flex-col-reverse gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">带 <span className="text-destructive">*</span> 为必填字段</p>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={props.onClose}>取消</Button><Button type="submit" disabled={missing}><Check data-icon="inline-start" />{props.saveLabel ?? '保存'}</Button></div>
          </footer>
        </form>
      </section>
    </div>
  )
}

export function UedPrototypeNotice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{children}</p>
}
