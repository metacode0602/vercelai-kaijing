'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Link2 } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId: string
}

export function ContractLinkDevicesDialog({ open, onOpenChange, contractId }: Props) {
  const utils = trpc.useUtils()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data, isLoading } = trpc.supplier.contract.listUnlinkedDevices.useQuery(
    { contractId, search: search || undefined, page: 1, pageSize: 50 },
    { enabled: open },
  )

  const linkMutation = trpc.supplier.contract.linkDevices.useMutation({
    onSuccess: (res) => {
      toast.success(`已关联 ${res?.linked ?? selected.size} 台设备`)
      setSelected(new Set())
      void utils.supplier.contract.listLinkedDevices.invalidate({ contractId })
      void utils.supplier.contract.listUnlinkedDevices.invalidate({ contractId })
      void utils.supplier.contract.getById.invalidate({ contractId })
      onOpenChange(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const allIds = useMemo(() => items.map((i) => i.id), [items])
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allIds))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>关联设备到合同</DialogTitle>
          <DialogDescription>
            选择尚未关联合同的设备，手动挂到当前生效合同（批次上传会自动关联；此处用于补录）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="按 SN / IP / 资产号搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>SN</TableHead>
                  <TableHead>机房</TableHead>
                  <TableHead>卡型</TableHead>
                  <TableHead>内网 IP</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      暂无可关联设备
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={() => toggleOne(d.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{d.sn}</TableCell>
                      <TableCell>{d.dataCenterName ?? '—'}</TableCell>
                      <TableCell>{d.cardTypeName ?? '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{d.internalIp ?? '—'}</TableCell>
                      <TableCell>{d.opsStatus ?? d.lifecycleStatus ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            已选 {selected.size} 台；共 {data?.total ?? 0} 台未关联
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={selected.size === 0 || linkMutation.isPending}
            onClick={() =>
              linkMutation.mutate({ contractId, deviceIds: Array.from(selected) })
            }
          >
            {linkMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            确认关联
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
