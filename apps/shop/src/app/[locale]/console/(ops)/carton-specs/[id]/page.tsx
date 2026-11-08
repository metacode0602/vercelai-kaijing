'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
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

export default function CartonSpecDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const router = useRouter()
  const utils = trpc.useUtils()
  const query = trpc.cartonSpecs.get.useQuery({ id })
  const meta = trpc.cartonSpecs.meta.useQuery()
  const row = query.data
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmStatus, setConfirmStatus] = React.useState<'启用' | '停用' | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const updateMutation = trpc.cartonSpecs.update.useMutation({
    onSuccess: async () => {
      await utils.cartonSpecs.get.invalidate({ id })
      await utils.cartonSpecs.list.invalidate()
      setEditOpen(false)
      setConfirmStatus(null)
      setNotice('箱规已保存到数据库。')
    },
    onError: (e) => setNotice(e.message),
  })
  const removeMutation = trpc.cartonSpecs.remove.useMutation({
    onSuccess: async () => {
      await utils.cartonSpecs.list.invalidate()
      router.push('/console/carton-specs')
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/carton-specs" title="加载中…" description="读取箱规…" />
  }
  if (!row) {
    return (
      <DetailPageHeader backHref="/console/carton-specs" title="未找到箱规" description={`箱规 ${id} 不存在。`} />
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '箱规管理', href: '/console/carton-specs' }, { label: row.code }]}
      />
      <DetailPageHeader
        backHref="/console/carton-specs"
        title={row.name}
        description={`${row.code} · ${row.applicablePack || '—'}`}
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
              删除
            </Button>
          </div>
        }
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <DetailFieldGrid
        title="箱规档案"
        fields={[
          { label: '编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '适用包装', value: row.applicablePack || '—' },
          { label: '长(cm)', value: String(row.lengthCm) },
          { label: '宽(cm)', value: String(row.widthCm) },
          { label: '高(cm)', value: String(row.heightCm) },
          { label: '毛重(kg)', value: String(row.grossWeightKg) },
          { label: '每箱件数', value: String(row.unitsPerCarton) },
          { label: '备注', value: row.note || '—' },
          { label: '更新时间', value: row.updatedAt },
        ]}
      />

      {editOpen ? (
        <UedDialog
          title="编辑箱规"
          description="修改后写入 commerce_carton_specs。"
          fields={[
            { key: 'name', label: '名称', required: true, defaultValue: row.name },
            { key: 'applicablePack', label: '适用包装', defaultValue: row.applicablePack },
            { key: 'lengthCm', label: '长 cm', defaultValue: String(row.lengthCm) },
            { key: 'widthCm', label: '宽 cm', defaultValue: String(row.widthCm) },
            { key: 'heightCm', label: '高 cm', defaultValue: String(row.heightCm) },
            { key: 'grossWeightKg', label: '毛重 kg', defaultValue: String(row.grossWeightKg) },
            { key: 'unitsPerCarton', label: '每箱件数', defaultValue: String(row.unitsPerCarton) },
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
              applicablePack: values.applicablePack ?? row.applicablePack,
              lengthCm: Number(values.lengthCm) || Number(row.lengthCm),
              widthCm: Number(values.widthCm) || Number(row.widthCm),
              heightCm: Number(values.heightCm) || Number(row.heightCm),
              grossWeightKg: Number(values.grossWeightKg) || Number(row.grossWeightKg),
              unitsPerCarton: Number(values.unitsPerCarton) || row.unitsPerCarton,
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
            <AlertDialogTitle>确认{confirmStatus}箱规？</AlertDialogTitle>
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
            <AlertDialogTitle>删除箱规 {row.code}？</AlertDialogTitle>
            <AlertDialogDescription>
              物理删除主档。若已被海运装箱行引用将被拒绝（此时请改用「停用」）。
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
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
