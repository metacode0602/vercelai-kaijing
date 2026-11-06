'use client'

import * as React from 'react'
import { Plus, Search } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'

export default function DictionariesPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.dictionaries.list.useQuery()
  const categories = listQuery.data ?? []
  const [selectedKey, setSelectedKey] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [dialog, setDialog] = React.useState<'category' | 'value' | null>(null)
  const [categoryName, setCategoryName] = React.useState('')
  const [categoryDescription, setCategoryDescription] = React.useState('')
  const [valueName, setValueName] = React.useState('')
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    if (!selectedKey && categories[0]) setSelectedKey(categories[0].key)
  }, [categories, selectedKey])

  const selected = categories.find((item) => item.key === selectedKey) ?? categories[0]
  const inactive = new Set(selected?.inactiveValues ?? [])
  const activeValues = (selected?.values ?? []).filter((v) => !inactive.has(v))
  const filtered = categories.filter((item) =>
    `${item.label} ${item.description} ${item.values.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  )

  const upsert = trpc.dictionaries.upsert.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      setCategoryName('')
      setCategoryDescription('')
      if (row) setSelectedKey(row.key)
      setNotice('字典已落库（commerce_dictionaries）。')
      await utils.dictionaries.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const addValue = trpc.dictionaries.addValue.useMutation({
    onSuccess: async () => {
      setDialog(null)
      setValueName('')
      setNotice('字典值已添加。')
      await utils.dictionaries.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const setActive = trpc.dictionaries.setValueActive.useMutation({
    onSuccess: async () => {
      await utils.dictionaries.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">数据字典</h2>
        <p className="text-sm text-muted-foreground">commerce_dictionaries 租户配置；空列表请先 seed 或新增字典。</p>
      </div>
      <UedPrototypeNotice>已接库，不再使用 localStorage DEMO。种子：db:seed:commerce-console-ops。</UedPrototypeNotice>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b p-2">
            <Search className="size-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索字典" className="h-8 border-0 shadow-none" />
          </div>
          <nav className="flex flex-col p-2" aria-label="字典分类">
            {listQuery.isLoading ? <p className="p-2 text-sm text-muted-foreground">加载中…</p> : null}
            {!listQuery.isLoading && filtered.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">暂无字典。请 seed 或新增。</p>
            ) : null}
            {filtered.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-md px-2 py-1.5 text-left text-sm ${item.key === selected?.key ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
                onClick={() => setSelectedKey(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="border-t p-2">
            <Button size="sm" className="w-full" onClick={() => setDialog('category')}>
              <Plus className="mr-1 size-4" /> 新增字典
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{selected.label}</h3>
                  <p className="text-sm text-muted-foreground">{selected.description || selected.key}</p>
                </div>
                <Button size="sm" onClick={() => setDialog('value')}>
                  添加值
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeValues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无启用值。</p>
                ) : (
                  activeValues.map((value) => (
                    <Badge key={value} variant="secondary" className="gap-2">
                      {value}
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => setActive.mutate({ key: selected.key, value, active: false })}
                      >
                        停用
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              {(selected.inactiveValues ?? []).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">已停用</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.inactiveValues.map((value) => (
                      <Badge key={value} variant="outline" className="gap-2">
                        {value}
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => setActive.mutate({ key: selected.key, value, active: true })}
                        >
                          启用
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">请选择或新增字典。</p>
          )}
        </div>
      </div>

      {dialog === 'category' ? (
        <form
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            const key = categoryName.trim().toLowerCase().replace(/\s+/g, '_')
            if (!key) return
            upsert.mutate({
              key,
              label: categoryName.trim(),
              description: categoryDescription.trim(),
              values: [],
              inactiveValues: [],
            })
          }}
        >
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-background p-4 shadow-lg">
            <h3 className="font-medium">新增字典</h3>
            <div className="space-y-1">
              <Label>名称</Label>
              <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>说明</Label>
              <Textarea value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </div>
          </div>
        </form>
      ) : null}

      {dialog === 'value' && selected ? (
        <form
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valueName.trim()) return
            addValue.mutate({ key: selected.key, value: valueName.trim() })
          }}
        >
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-background p-4 shadow-lg">
            <h3 className="font-medium">添加值 · {selected.label}</h3>
            <div className="space-y-1">
              <Label>标准值</Label>
              <Input value={valueName} onChange={(e) => setValueName(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  )
}
