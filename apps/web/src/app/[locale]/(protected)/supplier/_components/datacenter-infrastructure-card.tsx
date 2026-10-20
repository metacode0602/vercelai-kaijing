'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Gauge, HardDrive, Network, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Separator } from '@workspace/ui/components/separator'
import { trpc } from '@/lib/trpc/client'
import type { DataCenter } from '@/lib/data/types'
import {
  buildDefaultInfrastructureForm,
  type DatacenterInfrastructureForm,
} from '@/lib/supplier/datacenter-infrastructure-config-utils'
import { DatacenterInfrastructureEditDialogForm } from './datacenter-infrastructure-edit-dialog-form'

function SummaryBlock({ title, icon, lines }: { title: string; icon: ReactNode; lines: string[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        {lines.length > 0 ? (
          <div className="space-y-1 text-sm text-foreground">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未配置</p>
        )}
      </div>
    </section>
  )
}

export function DatacenterInfrastructureCard({
  dataCenter,
}: {
  dataCenter: Pick<
    DataCenter,
    'id' | 'name' | 'internalNetworkCidr' | 'publicIpCount' | 'networkFee'
  >
}) {
  const utils = trpc.useUtils()
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<DatacenterInfrastructureForm>(() =>
    buildDefaultInfrastructureForm(dataCenter),
  )

  const { data, isLoading, isError, error, refetch } =
    trpc.supplier.datacenterInfrastructure.get.useQuery({ dataCenterId: dataCenter.id })

  useEffect(() => {
    if (!editOpen || !data) return
    setDraft(structuredClone(data.form))
  }, [editOpen, data])

  const upsertMutation = trpc.supplier.datacenterInfrastructure.upsert.useMutation({
    onSuccess: async () => {
      toast.success('机房基础设施配置已保存')
      setEditOpen(false)
      await utils.supplier.datacenterInfrastructure.get.invalidate({ dataCenterId: dataCenter.id })
      await utils.supplier.gpuCardTypes.getDatacenterDetail.invalidate()
    },
    onError: (e) => toast.error(e.message || '保存失败，请稍后重试'),
  })

  const bandwidthLines = useMemo(() => data?.bandwidthLines ?? [], [data])
  const networkLines = useMemo(() => data?.networkLines ?? [], [data])
  const storageLines = useMemo(() => data?.storageLines ?? [], [data])

  const openEdit = () => {
    if (data) {
      setDraft(structuredClone(data.form))
    } else {
      setDraft(buildDefaultInfrastructureForm(dataCenter))
    }
    setEditOpen(true)
  }

  const saveEdit = () => {
    upsertMutation.mutate({
      dataCenterId: dataCenter.id,
      bandwidth: draft.bandwidth,
      network: draft.network,
      storage: draft.storage,
    })
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">带宽 / 网络 / 存储</CardTitle>
            <CardDescription>机房级基础设施配置，供卡型详情弹窗与对外展示引用</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={openEdit}
            disabled={isLoading}
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑配置
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 grid grid-cols-1  lg:grid-cols-3 gap-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载配置…</p>
          ) : isError ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <span className="text-destructive">{error.message || '加载失败'}</span>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                重试
              </Button>
            </div>
          ) : (
            <>
              <SummaryBlock
                title="带宽"
                icon={<Gauge className="h-4 w-4 text-primary" />}
                lines={bandwidthLines}
              />
              <SummaryBlock
                title="网络"
                icon={<Network className="h-4 w-4 text-primary" />}
                lines={networkLines}
              />
              <SummaryBlock
                title="存储"
                icon={<HardDrive className="h-4 w-4 text-primary" />}
                lines={storageLines}
              />
              {!data?.updatedAt ? (
                <Badge variant="outline" className="text-muted-foreground">
                  尚未入库，展示为默认预填值
                </Badge>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑机房基础设施配置</DialogTitle>
            <DialogDescription>
              {dataCenter.name} — 带宽、网络、存储统一维护
            </DialogDescription>
          </DialogHeader>

          <DatacenterInfrastructureEditDialogForm value={draft} onChange={setDraft} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={upsertMutation.isPending}>
              取消
            </Button>
            <Button onClick={saveEdit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
