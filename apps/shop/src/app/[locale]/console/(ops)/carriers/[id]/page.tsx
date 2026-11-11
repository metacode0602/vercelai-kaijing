'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
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
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.carriers.get.useQuery({ id })
  const meta = trpc.carriers.meta.useQuery()
  const row = query.data
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmStatus, setConfirmStatus] = React.useState<'启用' | '停用' | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const updateMutation = trpc.carriers.update.useMutation({
    onSuccess: async () => {
      await utils.carriers.get.invalidate({ id })
      await utils.carriers.list.invalidate()
      setEditOpen(false)
      setConfirmStatus(null)
      setNotice('承运商已保存到数据库。')
    },
    onError: (e) => setNotice(e.message),
  })
  const removeMutation = trpc.carriers.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.carriers.get.invalidate({ id }), utils.carriers.list.invalidate()])
      setNotice('承运商已停用（未物理删除）。')
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/carriers" title="加载中…" description="读取承运商…" />
  }
  if (!row) {
    return <DetailPageHeader backHref="/console/carriers" title="未找到承运商" description={`编码/ID ${id} 不存在。`} />
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration items={[{ label: '承运商', href: '/console/carriers' }, { label: row.code }]} />
      <DetailPageHeader
        backHref="/console/carriers"
        title={row.name}
        description={`${row.type} · ${row.coverage || '覆盖待补充'}`}
        badges={<Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
            {row.status === '启用' ? (
              <Button size="sm" variant="outline" onClick={() => setConfirmStatus('停用')}>
                停用
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmStatus('启用')}>
                启用
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              停用并归档
            </Button>
          </div>
        }
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <DetailFieldGrid
        title="承运商档案"
        fields={[
          { label: '编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '类型', value: row.type },
          { label: '覆盖线路', value: row.coverage || '—' },
          { label: '联系人', value: row.contact || '—' },
          { label: '电话', value: row.phone || '—' },
          { label: '备注', value: row.note || '—' },
          { label: '更新时间', value: row.updatedAt },
        ]}
      />

      {editOpen ? (
        <UedDialog
          title="编辑承运商"
          description="修改后写入 commerce_carriers。"
          fields={[
            { key: 'name', label: '承运商名称', required: true, defaultValue: row.name },
            {
              key: 'type',
              label: '类型',
              options: [...(meta.data?.types ?? ['国际快递', '海运', '平台物流', '尾程派送'])],
              required: true,
              defaultValue: row.type,
            },
            { key: 'coverage', label: '覆盖线路', defaultValue: row.coverage },
            { key: 'contact', label: '联系人', defaultValue: row.contact },
            { key: 'phone', label: '联系电话', defaultValue: row.phone },
            {
              key: 'status',
              label: '状态',
              options: [...(meta.data?.statuses ?? ['启用', '停用'])],
              required: true,
              defaultValue: row.status,
            },
            { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: row.note },
          ]}
          onClose={() => setEditOpen(false)}
          onSave={(values) => {
            updateMutation.mutate({
              id: row.id,
              name: values.name || row.name,
              type: values.type || row.type,
              coverage: values.coverage ?? row.coverage,
              contact: values.contact ?? row.contact,
              phone: values.phone ?? row.phone,
              status: values.status === '停用' ? '停用' : '启用',
              note: values.note ?? row.note,
            })
          }}
          saveLabel="保存"
        />
      ) : null}

      <AlertDialog open={confirmStatus != null} onOpenChange={(o) => !o && setConfirmStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认{confirmStatus}承运商？</AlertDialogTitle>
            <AlertDialogDescription>
              将把 {row.code} 状态改为「{confirmStatus}」（软状态，不物理删除）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmStatus) return
                updateMutation.mutate({ id: row.id, status: confirmStatus })
              }}
            >
              确认{confirmStatus}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用承运商 {row.code}？</AlertDialogTitle>
            <AlertDialogDescription>
              将软停用该承运商，不会物理删除；已被海运柜次 / 履约批次 / 运价卡引用时同样只改状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false)
                removeMutation.mutate({ id: row.id })
              }}
            >
              确认停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
