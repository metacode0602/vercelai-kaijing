'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import {
  addCategory,
  categoryDepth,
  categoryPath,
  updateCategory,
  useCategories,
  type CategoryNode,
} from '@/lib/crossborder/category-store'

function flatten(rows: CategoryNode[], parentId: string | null = null): CategoryNode[] {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .flatMap((row) => [row, ...flatten(rows, row.id)])
}

function descendants(rows: CategoryNode[], id: string): string[] {
  const children = rows.filter((row) => row.parentId === id)
  return children.flatMap((child) => [child.id, ...descendants(rows, child.id)])
}

export default function CategoriesPage() {
  const rows = useCategories()
  const [dialog, setDialog] = React.useState<{ mode: 'create' | 'edit'; row?: CategoryNode; parentId: string | null } | null>(null)
  const [notice, setNotice] = React.useState('')

  const ordered = flatten(rows)
  const blocked = dialog?.row ? new Set([dialog.row.id, ...descendants(rows, dialog.row.id)]) : new Set<string>()
  const parentOptions = [
    '无（一级品类）',
    ...rows.filter((row) => !blocked.has(row.id)).map((row) => categoryPath(rows, row)),
  ]
  const initialParentId = dialog?.row?.parentId ?? dialog?.parentId ?? null
  const initialParent = initialParentId ? rows.find((row) => row.id === initialParentId) : null

  const editor = dialog ? (
    <UedDialog
      title={dialog.mode === 'create' ? '新增品类' : '编辑品类'}
      description="品类支持多级父子结构；停用父类时子类不再出现在新建商品下拉。"
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
        parent: initialParent ? categoryPath(rows, initialParent) : '无（一级品类）',
        sort: String(dialog.row?.sort ?? 10),
        status: dialog.row?.status ?? '启用',
        note: dialog.row?.note ?? '',
      }}
      onClose={() => setDialog(null)}
      onSave={(values) => {
        const parentPath = values.parent === '无（一级品类）' ? null : rows.find((row) => categoryPath(rows, row) === values.parent)?.id ?? null
        const patch = {
          name: values.name || '未命名品类',
          code: (values.code || 'CATEGORY').toUpperCase(),
          parentId: parentPath,
          sort: Number(values.sort || 0),
          status: values.status === '停用' ? '停用' as const : '启用' as const,
          note: values.note ?? '',
        }
        if (dialog.mode === 'edit' && dialog.row) {
          updateCategory(rows, dialog.row.id, patch)
          setNotice(`${patch.name} 已更新；商品下拉会立即读取最新品类树。`)
        } else {
          addCategory(rows, patch)
          setNotice(`${patch.name} 已新增；商品下拉会立即读取最新品类树。`)
        }
        setDialog(null)
      }}
      saveLabel="保存品类"
    />
  ) : null

  return (
    <>
      {editor}
      <div className="flex w-full flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">品类树</h1>
            <p className="mt-1 text-sm text-muted-foreground">多级品类主数据；商品 SPU 和刊登共用同一棵树。</p>
          </div>
          <Button onClick={() => setDialog({ mode: 'create', parentId: null })}>
            <Plus data-icon="inline-start" />
            新增一级品类
          </Button>
        </header>

        <UedPrototypeNotice>
          品类编码保持稳定；停用父类后，其子类不再出现在新建商品下拉，但历史商品仍保留原品类。自定义情感标签、品牌等枚举在「基础数据字典」维护。
        </UedPrototypeNotice>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>品类</TableHead>
                <TableHead>编码</TableHead>
                <TableHead>上级</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-56 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((row) => {
                const depth = categoryDepth(rows, row)
                const parent = row.parentId ? rows.find((item) => item.id === row.parentId) : null
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="flex items-center">
                        {Array.from({ length: depth }).map((_, index) => (
                          <span key={index} className="inline-block w-4" />
                        ))}
                        <span className={depth === 0 ? 'font-medium' : ''}>{row.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="text-muted-foreground">{parent?.name ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{row.sort}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: 'create', parentId: row.id })}>新增子类</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: 'edit', row, parentId: row.parentId })}>编辑</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            updateCategory(rows, row.id, { status: row.status === '启用' ? '停用' : '启用' })
                            setNotice(`${row.name} 已${row.status === '启用' ? '停用' : '启用'}。`)
                          }}
                        >
                          {row.status === '启用' ? '停用' : '启用'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {ordered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">还没有品类，先新增一级品类。</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </div>
    </>
  )
}
