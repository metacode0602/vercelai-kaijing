'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

type Cat = {
  id: string
  code: string
  name: string
  parentId: string | null
  sort: number
  status: string
  note: string
}

function flatten(rows: Cat[], parentId: string | null = null): Cat[] {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .flatMap((row) => [row, ...flatten(rows, row.id)])
}

function pathOf(rows: Cat[], node: Cat): string {
  const parts = [node.name]
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = rows.find((r) => r.id === parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join(' / ')
}

function depthOf(rows: Cat[], node: Cat): number {
  let depth = 0
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    depth += 1
    parentId = rows.find((r) => r.id === parentId)?.parentId ?? null
  }
  return depth
}

export default function CategoriesPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.categories.list.useQuery({})
  const rows = (listQuery.data ?? []) as Cat[]
  const [dialog, setDialog] = React.useState<{ mode: 'create' | 'edit'; row?: Cat; parentId: string | null } | null>(null)
  const [notice, setNotice] = React.useState('')

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: async () => {
      setDialog(null)
      setNotice('品类已落库（commerce_categories）。')
      await utils.categories.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: async () => {
      setDialog(null)
      setNotice('品类已更新。')
      await utils.categories.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const ordered = flatten(rows)
  const { pagedRows, pagination } = useConsolePagination(ordered)
  const parentOptions = ['无（一级品类）', ...rows.map((row) => pathOf(rows, row))]

  const editor = dialog ? (
    <UedDialog
      title={dialog.mode === 'create' ? '新增品类' : '编辑品类'}
      description="内部品类树；平台类目请走 platform_categories 同步（待平台授权）。"
      fields={[
        { key: 'name', label: '品类名称', required: true },
        { key: 'code', label: '品类编码', required: true, placeholder: '如 APPAREL-TOPS-TEE' },
        { key: 'parent', label: '上级品类', options: parentOptions, required: true },
        { key: 'sort', label: '排序', type: 'number', required: true },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      initialValues={{
        name: dialog.row?.name ?? '',
        code: dialog.row?.code ?? '',
        parent: (() => {
          const pid = dialog.row?.parentId ?? dialog.parentId
          const p = pid ? rows.find((r) => r.id === pid) : null
          return p ? pathOf(rows, p) : '无（一级品类）'
        })(),
        sort: String(dialog.row?.sort ?? 10),
        status: dialog.row?.status ?? '启用',
        note: dialog.row?.note ?? '',
      }}
      onClose={() => setDialog(null)}
      onSave={(values) => {
        const parentPath = values.parent === '无（一级品类）' ? null : rows.find((row) => pathOf(rows, row) === values.parent)?.id ?? null
        const payload = {
          name: values.name || '未命名品类',
          code: (values.code || 'CATEGORY').toUpperCase(),
          parentId: parentPath,
          sort: Number(values.sort || 10),
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        }
        if (dialog.mode === 'edit' && dialog.row) {
          updateMutation.mutate({ id: dialog.row.id, ...payload })
        } else {
          createMutation.mutate(payload)
        }
      }}
    />
  ) : null

  return (
    <div className="space-y-4">
      {editor}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">品类树</h2>
          <p className="text-sm text-muted-foreground">commerce_categories 内部多级品类；非平台类目缓存。</p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create', parentId: null })}>
          <Plus className="mr-1 size-4" /> 新增品类
        </Button>
      </div>
      <UedPrototypeNotice>
        已接库。空列表表示尚未配置；平台类目同步需 OpenAPI 授权，不会用演示树冒充。
      </UedPrototypeNotice>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <ConsoleListSection title="品类列表" description={listQuery.isLoading ? '加载中…' : `共 ${rows.length} 条`} pagination={pagination}>
        {pagedRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">暂无品类数据。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>编码</TableHead>
                <TableHead>路径</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell style={{ paddingLeft: 12 + depthOf(rows, row) * 16 }}>{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{pathOf(rows, row)}</TableCell>
                  <TableCell className="tabular-nums">{row.sort}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'create', parentId: row.id })}>
                        子类
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'edit', row, parentId: row.parentId })}>
                        编辑
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
