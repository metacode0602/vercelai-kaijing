'use client'

import * as React from 'react'
import { Check, ChevronRight, Pencil, Plus, Search, Tag } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
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
import { trpc } from '@/lib/trpc/client'

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/

type DialogMode = 'create-category' | 'edit-category' | 'create-value' | 'edit-value' | null
type ConfirmState = { value: string; active: boolean } | null

export default function DictionariesPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.dictionaries.list.useQuery()
  const categories = listQuery.data ?? []
  const [selectedKey, setSelectedKey] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [dialog, setDialog] = React.useState<DialogMode>(null)
  const [confirm, setConfirm] = React.useState<ConfirmState>(null)
  const [categoryKey, setCategoryKey] = React.useState('')
  const [categoryLabel, setCategoryLabel] = React.useState('')
  const [categoryDescription, setCategoryDescription] = React.useState('')
  const [valueName, setValueName] = React.useState('')
  const [valueTitle, setValueTitle] = React.useState('')
  const [editingValue, setEditingValue] = React.useState('')
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    if (!selectedKey && categories[0]) setSelectedKey(categories[0].key)
  }, [categories, selectedKey])

  const selected = categories.find((item) => item.key === selectedKey) ?? categories[0]
  const inactive = new Set(selected?.inactiveValues ?? [])
  const activeValues = (selected?.values ?? []).filter((value) => !inactive.has(value))
  const titleOf = (value: string) => selected?.valueTitles?.[value] ?? value
  const filtered = categories.filter((item) =>
    `${item.label} ${item.key} ${item.description} ${item.values.join(' ')} ${Object.values(item.valueTitles).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const invalidate = () => utils.dictionaries.list.invalidate()
  const initFromCatalog = trpc.dictionaries.initFromCatalog.useMutation({
    onSuccess: async (result) => {
      setNotice(result.inserted > 0 ? `已从平台目录补齐 ${result.inserted} 个字典（只补缺失，不覆盖已有）。` : '字典已齐全，无需补齐。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })


  const upsert = trpc.dictionaries.upsert.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      if (row) setSelectedKey(row.key)
      setNotice(dialog === 'edit-category' ? '字典标题已更新。' : '字典已新增。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const addValue = trpc.dictionaries.addValue.useMutation({
    onSuccess: async () => {
      setDialog(null)
      setValueName('')
      setValueTitle('')
      setNotice('标准值已添加。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateValue = trpc.dictionaries.updateValue.useMutation({
    onSuccess: async () => {
      setDialog(null)
      setValueName('')
      setValueTitle('')
      setEditingValue('')
      setNotice('标准值已修改。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const setActive = trpc.dictionaries.setValueActive.useMutation({
    onSuccess: async () => {
      setNotice(confirm?.active ? '标准值已启用。' : '标准值已停用。')
      setConfirm(null)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  function openCreateCategory() {
    setCategoryKey('')
    setCategoryLabel('')
    setCategoryDescription('')
    setDialog('create-category')
  }

  function openEditCategory() {
    if (!selected) return
    setCategoryKey(selected.key)
    setCategoryLabel(selected.label)
    setCategoryDescription(selected.description)
    setDialog('edit-category')
  }

  function openCreateValue() {
    setValueName('')
    setValueTitle('')
    setEditingValue('')
    setDialog('create-value')
  }

  function openEditValue(value: string) {
    setValueName(value)
    setValueTitle(titleOf(value))
    setEditingValue(value)
    setDialog('edit-value')
  }

  function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = categoryKey.trim().toLowerCase()
    const label = categoryLabel.trim()
    if (!KEY_PATTERN.test(key)) {
      setNotice('值需为英文小写，且只能包含字母、数字和下划线，例如 product_style。')
      return
    }
    if (!label) {
      setNotice('请填写中文标题。')
      return
    }
    upsert.mutate({
      key,
      label,
      description: categoryDescription.trim(),
      ...(dialog === 'create-category' ? { values: [], valueTitles: {}, inactiveValues: [] } : {}),
    })
  }

  function saveValue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const value = valueName.trim()
    const title = valueTitle.trim()
    if (!value) {
      setNotice('请填写值（英文）。')
      return
    }
    if (!title) {
      setNotice('请填写标题（中文）。')
      return
    }
    if (dialog === 'edit-value') {
      if (value === editingValue && title === titleOf(editingValue)) {
        setDialog(null)
        return
      }
      updateValue.mutate({ key: selected.key, from: editingValue, to: value, title })
      return
    }
    addValue.mutate({ key: selected.key, value, title })
  }

  const dialogTitle =
    dialog === 'create-category'
      ? '新增字典'
      : dialog === 'edit-category'
        ? '编辑字典'
        : dialog === 'edit-value'
          ? '编辑标准值'
          : `新增${selected?.label ?? ''}标准值`

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">基础数据字典</h1>
          <p className="text-sm text-muted-foreground">一次维护，商品、店铺和仓库配置共用标准值</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={initFromCatalog.isPending}
            onClick={() => initFromCatalog.mutate()}
          >
            {initFromCatalog.isPending ? '补齐中…' : '从平台目录补齐'}
          </Button>
          <Button onClick={openCreateCategory}>
            <Plus data-icon="inline-start" />新增字典
          </Button>
        </div>
      </header>

      <div className="grid min-h-[540px] overflow-hidden rounded-lg border md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 md:border-b-0 md:border-r">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索字典"
                className="pl-9"
              />
            </div>
          </div>
          <nav className="flex flex-col p-2" aria-label="字典分类">
            {listQuery.isLoading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">加载中…</p>
            ) : null}
            {!listQuery.isLoading && filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配字典</p>
            ) : null}
            {filtered.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => setSelectedKey(item.key)}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedKey === item.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Tag className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="ml-2 text-xs tabular-nums">{item.values.length}</span>
              </button>
            ))}
          </nav>
        </aside>

        {selected ? (
          <section className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">{selected.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.description || selected.key}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={openEditCategory}>
                  <Pencil data-icon="inline-start" />编辑字典
                </Button>
                <Button size="sm" onClick={openCreateValue}>
                  <Plus data-icon="inline-start" />新增标准值
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 border-b px-5 py-3 text-sm text-muted-foreground">
              <Badge variant="secondary">共享字典</Badge>
              <span>用于所有关联平台、站点和业务对象</span>
              <span className="ml-auto">
                {activeValues.length} 个启用值
                {selected.inactiveValues.length ? ` · ${selected.inactiveValues.length} 个停用值` : ''}
              </span>
            </div>
            <div className="grid grid-cols-[minmax(120px,1fr)_minmax(140px,1fr)_80px_150px] items-center gap-3 border-b px-5 py-2 text-xs font-medium text-muted-foreground">
              <span>标题</span>
              <span>值</span>
              <span>状态</span>
              <span className="text-right">操作</span>
            </div>
            <div className="flex flex-col">
              {activeValues.map((value) => (
                <div
                  key={value}
                  className="grid grid-cols-[minmax(120px,1fr)_minmax(140px,1fr)_80px_150px] items-center gap-3 border-b px-5 py-3 text-sm last:border-0"
                >
                  <span className="truncate font-medium">{titleOf(value)}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{value}</span>
                  <span>
                    <Badge variant="secondary">启用</Badge>
                  </span>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditValue(value)}>
                      修改
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirm({ value, active: false })}
                    >
                      停用
                    </Button>
                  </div>
                </div>
              ))}
              {selected.inactiveValues.map((value) => (
                <div
                  key={`inactive-${value}`}
                  className="grid grid-cols-[minmax(120px,1fr)_minmax(140px,1fr)_80px_150px] items-center gap-3 border-b bg-muted/20 px-5 py-3 text-sm last:border-0"
                >
                  <span className="truncate text-muted-foreground line-through">{titleOf(value)}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{value}</span>
                  <span>
                    <Badge variant="outline">停用</Badge>
                  </span>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditValue(value)}>
                      修改
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirm({ value, active: true })}
                    >
                      启用
                    </Button>
                  </div>
                </div>
              ))}
              {activeValues.length === 0 && selected.inactiveValues.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
                  <p className="font-medium">此字典还没有标准值</p>
                  <p className="text-sm text-muted-foreground">新增标准值后，关联表单即可直接复用。</p>
                  <Button variant="outline" size="sm" onClick={openCreateValue}>
                    <Plus data-icon="inline-start" />新增标准值
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="mt-auto flex items-start gap-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
              <ChevronRight className="mt-0.5 size-4 shrink-0" />
              <p>已被业务记录引用的值应停用保留，不应物理删除；停用值不会出现在新业务表单中。</p>
            </div>
          </section>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">请选择或新增字典。</p>
        )}
      </div>

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialog === 'create-category' || dialog === 'edit-category'
                ? '值使用英文，标题用于中文界面展示'
                : '标准值保存英文 code，标题用于界面展示与筛选'}
            </DialogDescription>
          </DialogHeader>

          {dialog === 'create-category' || dialog === 'edit-category' ? (
            <form onSubmit={saveCategory} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="dictionary-key">值（英文）</Label>
                <Input
                  id="dictionary-key"
                  value={categoryKey}
                  onChange={(event) => setCategoryKey(event.target.value)}
                  placeholder="如 product_style"
                  readOnly={dialog === 'edit-category'}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  小写字母开头，仅允许字母、数字和下划线；创建后不可修改。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dictionary-label">标题（中文）</Label>
                <Input
                  id="dictionary-label"
                  value={categoryLabel}
                  onChange={(event) => setCategoryLabel(event.target.value)}
                  placeholder="如 款式/版型"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dictionary-description">说明</Label>
                <Textarea
                  id="dictionary-description"
                  value={categoryDescription}
                  onChange={(event) => setCategoryDescription(event.target.value)}
                  placeholder="描述哪些模块会复用"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={upsert.isPending}>
                  <Check data-icon="inline-start" />
                  {dialog === 'edit-category' ? '保存' : '创建字典'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={saveValue} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="dictionary-value">值（英文）</Label>
                <Input
                  id="dictionary-value"
                  value={valueName}
                  onChange={(event) => setValueName(event.target.value)}
                  placeholder="如 cotton"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dictionary-value-title">标题（中文）</Label>
                <Input
                  id="dictionary-value-title"
                  value={valueTitle}
                  onChange={(event) => setValueTitle(event.target.value)}
                  placeholder="如 棉"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={addValue.isPending || updateValue.isPending}>
                  <Check data-icon="inline-start" />保存标准值
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.active ? '确认启用标准值？' : '确认停用标准值？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.active
                ? `启用「${confirm ? titleOf(confirm.value) : ''}」后，新业务表单将重新显示该选项。`
                : `停用「${confirm ? titleOf(confirm.value) : ''}」后，新业务表单将不再显示该选项，历史数据保持不变。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.active ? 'default' : 'destructive'}
              disabled={setActive.isPending}
              onClick={() => {
                if (!confirm || !selected) return
                setActive.mutate({ key: selected.key, value: confirm.value, active: confirm.active })
              }}
            >
              确认{confirm?.active ? '启用' : '停用'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
