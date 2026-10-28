'use client'

import * as React from 'react'
import { Check, ChevronRight, Plus, Search, Tag, X } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  INITIAL_DICTIONARIES,
} from '@/lib/crossborder/platform-basics-data'

export default function DictionariesPage() {
  const [categories, setCategories] = React.useState(INITIAL_DICTIONARIES)
  const [inactiveValues, setInactiveValues] = React.useState<Record<string, string[]>>({})
  const [selectedKey, setSelectedKey] = React.useState(INITIAL_DICTIONARIES[0]?.key ?? '')
  const [query, setQuery] = React.useState('')
  const [dialog, setDialog] = React.useState<'category' | 'value' | 'edit-value' | null>(null)
  const [categoryName, setCategoryName] = React.useState('')
  const [categoryDescription, setCategoryDescription] = React.useState('')
  const [valueName, setValueName] = React.useState('')
  const [aliases, setAliases] = React.useState('')
  const [editingValue, setEditingValue] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const selected = categories.find((item) => item.key === selectedKey) ?? categories[0]
  const activeValues = selected?.values.filter((value) => !inactiveValues[selected.key]?.includes(value)) ?? []
  const filteredCategories = categories.filter((item) => `${item.label} ${item.description} ${item.values.join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = categoryName.trim().toLowerCase().replace(/\s+/g, '_')
    if (!key || categories.some((item) => item.key === key)) {
      setNotice('请使用未重复的字典名称。')
      return
    }
    const item = { key, label: categoryName.trim(), description: categoryDescription.trim() || '可被多个业务模块复用', shared: true, values: [] }
    setCategories((current) => [...current, item])
    setSelectedKey(key)
    setDialog(null)
    setCategoryName('')
    setCategoryDescription('')
    setNotice('字典已新增到本次原型会话。')
  }

  function saveValue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !valueName.trim()) return
    const normalizedAliases = aliases.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    const aliasConflict = categories.some((category) => category.key === selected.key && category.values.some((canonical) => canonical !== editingValue && normalizedAliases.includes(canonical.toLowerCase())))
    if (aliasConflict) {
      setNotice('别名与现有标准值重名，请合并到已有标准值。')
      return
    }
    if (dialog === 'edit-value') {
      setCategories((current) => current.map((item) => item.key === selected.key ? { ...item, values: item.values.map((value) => value === editingValue ? valueName.trim() : value) } : item))
      setInactiveValues((current) => ({ ...current, [selected.key]: (current[selected.key] ?? []).map((value) => value === editingValue ? valueName.trim() : value) }))
    } else if (selected.values.some((value) => value.toLowerCase() === valueName.trim().toLowerCase())) {
      setNotice('该标准值已存在，请编辑现有值或补充为别名。')
      return
    } else {
      setCategories((current) => current.map((item) => item.key === selected.key ? { ...item, values: [...item.values, valueName.trim()] } : item))
    }
    setDialog(null)
    setValueName('')
    setAliases('')
    setEditingValue('')
    setNotice('字典值已保存到本次原型会话；别名随标准值归一。')
  }

  function deactivateValue(value: string) {
    if (!selected) return
    setInactiveValues((current) => ({ ...current, [selected.key]: [...(current[selected.key] ?? []), value] }))
    setNotice('该值已停用，不再出现在原型选择项中；历史记录保留。')
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1"><h1 className="text-xl font-semibold tracking-tight">基础数据字典</h1><p className="text-sm text-muted-foreground">一次维护，商品、店铺和仓库配置共用标准值</p></div>
        <Button onClick={() => setDialog('category')}><Plus data-icon="inline-start" />新增字典</Button>
      </header>

      <div className="grid min-h-[540px] overflow-hidden rounded-lg border md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 md:border-b-0 md:border-r">
          <div className="border-b p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字典" className="pl-9" /></div></div>
          <nav className="flex flex-col p-2" aria-label="字典分类">
            {filteredCategories.map((item) => <button type="button" key={item.key} onClick={() => setSelectedKey(item.key)} className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedKey === item.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><span className="flex min-w-0 items-center gap-2"><Tag className="size-4 shrink-0" /><span className="truncate">{item.label}</span></span><span className="ml-2 text-xs tabular-nums">{item.values.length}</span></button>)}
        {filteredCategories.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配字典</p> : null}
          </nav>
        </aside>

        {selected ? <section className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-semibold">{selected.label}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.description}</p></div><Button size="sm" onClick={() => { setValueName(''); setAliases(''); setDialog('value') }}><Plus data-icon="inline-start" />新增标准值</Button></div>
          <div className="flex items-center gap-2 border-b px-5 py-3 text-sm text-muted-foreground"><Badge variant="secondary">共享字典</Badge><span>用于所有关联平台、站点和业务对象</span><span className="ml-auto">{activeValues.length} 个启用值{(inactiveValues[selected.key] ?? []).length ? ` · ${inactiveValues[selected.key].length} 个停用值` : ''}</span></div>
          <div className="grid grid-cols-[minmax(140px,1fr)_minmax(180px,1.5fr)_100px] items-center gap-3 border-b px-5 py-2 text-xs font-medium text-muted-foreground"><span>标准名称</span><span>历史别名</span><span className="text-right">操作</span></div>
          <div className="flex flex-col">
            {activeValues.map((value) => <div key={value} className="grid grid-cols-[minmax(140px,1fr)_minmax(180px,1.5fr)_100px] items-center gap-3 border-b px-5 py-3 text-sm last:border-0"><span className="font-medium">{value}</span><span className="truncate text-muted-foreground" title={value === '深灰色' ? '深灰、深灰色' : '—'}>{value === '深灰色' ? '深灰、深灰色' : '—'}</span><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingValue(value); setValueName(value); setAliases(value === '深灰色' ? '深灰' : ''); setDialog('edit-value') }}>编辑</Button><Button variant="ghost" size="sm" onClick={() => deactivateValue(value)}>停用</Button></div></div>)}
            {(inactiveValues[selected.key] ?? []).map((value) => <div key={`inactive-${value}`} className="grid grid-cols-[minmax(140px,1fr)_minmax(180px,1.5fr)_100px] items-center gap-3 border-b bg-muted/20 px-5 py-3 text-sm last:border-0"><span className="text-muted-foreground line-through">{value}</span><span className="truncate text-muted-foreground">停用</span><Button variant="ghost" size="sm" onClick={() => setInactiveValues((current) => ({ ...current, [selected.key]: current[selected.key]?.filter((entry) => entry !== value) ?? [] }))}>启用</Button></div>)}
            {activeValues.length === 0 ? <div className="flex flex-col items-center gap-2 px-5 py-16 text-center"><p className="font-medium">此字典还没有启用的标准值</p><p className="text-sm text-muted-foreground">新增标准值后，关联表单即可直接复用。</p><Button variant="outline" size="sm" onClick={() => setDialog('value')}><Plus data-icon="inline-start" />新增标准值</Button></div> : null}
          </div>
          <div className="mt-auto flex items-start gap-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground"><ChevronRight className="mt-0.5 size-4 shrink-0" /><p>历史别名用于旧数据导入与搜索；业务录入只选择标准名称。已被业务记录引用的值应停用保留，不应物理删除。</p></div>
        </section> : null}
      </div>

      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {dialog ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }} onKeyDown={(event) => { if (event.key === 'Escape') setDialog(null) }}><div role="dialog" aria-modal="true" aria-labelledby="dictionary-dialog-title" className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between"><div><h2 id="dictionary-dialog-title" className="font-semibold">{dialog === 'category' ? '新增字典' : dialog === 'edit-value' ? '编辑标准值' : `新增${selected?.label ?? ''}标准值`}</h2><p className="mt-1 text-sm text-muted-foreground">标准数据可被多个业务表单复用</p></div><Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => setDialog(null)}><X /></Button></div>
        {dialog === 'category' ? <form onSubmit={saveCategory} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="dictionary-name">字典名称</Label><Input id="dictionary-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="如 承运商" required /></div><div className="flex flex-col gap-2"><Label htmlFor="dictionary-description">用途</Label><Textarea id="dictionary-description" value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} placeholder="描述哪些模块会复用" rows={3} /></div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setDialog(null)}>取消</Button><Button type="submit"><Check data-icon="inline-start" />创建字典</Button></div></form> : <form onSubmit={saveValue} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="dictionary-value">标准名称</Label><Input id="dictionary-value" value={valueName} onChange={(event) => setValueName(event.target.value)} placeholder="输入统一标准值" required /></div><div className="flex flex-col gap-2"><Label htmlFor="dictionary-aliases">历史别名</Label><Textarea id="dictionary-aliases" value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="多个别名用逗号分隔" rows={2} /><p className="text-xs text-muted-foreground">导入和搜索时可匹配别名；新建业务数据仍保存标准名称。</p></div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setDialog(null)}>取消</Button><Button type="submit"><Check data-icon="inline-start" />保存标准值</Button></div></form>}
      </div></div> : null}
    </div>
  )
}
