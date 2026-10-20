'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Tag, Copy, Check } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Switch } from '@workspace/ui/components/switch'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

interface VersionForm {
  versionTag: string
  displayLabel: string
  fullImageRef: string
  cudaVersion: string
  osVersion: string
  pythonVersion: string
  sizeBytes: string
  digestSha256: string
  requiresGPU: boolean
  minGpuMemory: string
  isLatest: boolean
  releaseDate: string
  deprecationDate: string
  deprecationMessage: string
  status: string
}

const emptyForm: VersionForm = {
  versionTag: '',
  displayLabel: '',
  fullImageRef: '',
  cudaVersion: '',
  osVersion: '',
  pythonVersion: '',
  sizeBytes: '',
  digestSha256: '',
  requiresGPU: true,
  minGpuMemory: '',
  isLatest: false,
  releaseDate: '',
  deprecationDate: '',
  deprecationMessage: '',
  status: 'active',
}

const STATUS_OPTIONS = [
  { value: 'active', label: '启用' },
  { value: 'deprecated', label: '废弃' },
  { value: 'removed', label: '已移除' },
] as const

function statusBadgeVariant(status: string) {
  if (status === 'active') return 'default'
  if (status === 'deprecated') return 'secondary'
  return 'destructive'
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}

function formatSize(sizeBytes: string | number | null) {
  const bytes = Number(sizeBytes)
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="icon" className="size-6" onClick={handleCopy}>
      {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
    </Button>
  )
}

interface BaseImageVersionsContentProps {
  baseImageId: string
  baseImageName: string
}

export function BaseImageVersionsContent({ baseImageId, baseImageName }: BaseImageVersionsContentProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VersionForm>(emptyForm)

  const utils = trpc.useUtils()

  const { data: versions, isLoading } = trpc.admin.baseImageVersion.listByBaseImage.useQuery({ baseImageId })

  const createMutation = trpc.admin.baseImageVersion.create.useMutation({
    onSuccess: () => {
      utils.admin.baseImageVersion.listByBaseImage.invalidate({ baseImageId })
      setDialogOpen(false)
      setForm(emptyForm)
      toast.success('版本已创建')
    },
    onError: (e) => toast.error(e.message),
  })

  const updateMutation = trpc.admin.baseImageVersion.update.useMutation({
    onSuccess: () => {
      utils.admin.baseImageVersion.listByBaseImage.invalidate({ baseImageId })
      setDialogOpen(false)
      setEditingId(null)
      setForm(emptyForm)
      toast.success('版本已更新')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = trpc.admin.baseImageVersion.delete.useMutation({
    onSuccess: () => {
      utils.admin.baseImageVersion.listByBaseImage.invalidate({ baseImageId })
      setDeleteDialogId(null)
      toast.success('版本已删除')
    },
    onError: (e) => toast.error(e.message),
  })

  const items = versions ?? []

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(v: (typeof items)[number]) {
    setEditingId(v.id)
    setForm({
      versionTag: v.versionTag,
      displayLabel: v.displayLabel ?? '',
      fullImageRef: v.fullImageRef,
      cudaVersion: v.cudaVersion ?? '',
      osVersion: v.osVersion ?? '',
      pythonVersion: v.pythonVersion ?? '',
      sizeBytes: v.sizeBytes?.toString() ?? '',
      digestSha256: v.digestSha256 ?? '',
      requiresGPU: v.requiresGPU ?? true,
      minGpuMemory: v.minGpuMemory?.toString() ?? '',
      isLatest: v.isLatest ?? false,
      releaseDate: v.releaseDate ? new Date(v.releaseDate).toISOString().split('T')[0] ?? '' : '',
      deprecationDate: v.deprecationDate ? new Date(v.deprecationDate).toISOString().split('T')[0] ?? '' : '',
      deprecationMessage: v.deprecationMessage ?? '',
      status: v.status ?? 'active',
    })
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!form.versionTag.trim() || !form.fullImageRef.trim()) return

    const commonFields = {
      cudaVersion: form.cudaVersion.trim() || undefined,
      osVersion: form.osVersion.trim() || undefined,
      pythonVersion: form.pythonVersion.trim() || undefined,
      sizeBytes: form.sizeBytes ? Number(form.sizeBytes) : undefined,
      digestSha256: form.digestSha256.trim() || undefined,
      requiresGPU: form.requiresGPU,
      minGpuMemory: form.minGpuMemory ? Number(form.minGpuMemory) : undefined,
      isLatest: form.isLatest,
      releaseDate: form.releaseDate || undefined,
      deprecationDate: form.deprecationDate || undefined,
      deprecationMessage: form.deprecationMessage.trim() || undefined,
      status: form.status,
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        versionTag: form.versionTag.trim(),
        displayLabel: form.displayLabel.trim() || undefined,
        fullImageRef: form.fullImageRef.trim(),
        ...commonFields,
      })
    } else {
      createMutation.mutate({
        baseImageId,
        versionTag: form.versionTag.trim(),
        displayLabel: form.displayLabel.trim(),
        fullImageRef: form.fullImageRef.trim(),
        ...commonFields,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="size-6" />
            版本管理 — {baseImageName}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">管理此基础镜像的各版本信息与状态</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          新增版本
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" />
              加载中…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本标签</TableHead>
                  <TableHead>显示标签</TableHead>
                  <TableHead>镜像引用</TableHead>
                  <TableHead>CUDA</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Python</TableHead>
                  <TableHead>最新</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      暂无版本
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium font-mono text-sm">{v.versionTag}</TableCell>
                      <TableCell>{v.displayLabel ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[260px] block">
                            {v.fullImageRef}
                          </code>
                          <CopyButton text={v.fullImageRef} />
                        </div>
                      </TableCell>
                      <TableCell>{v.cudaVersion ?? '—'}</TableCell>
                      <TableCell>{v.osVersion ?? '—'}</TableCell>
                      <TableCell>{v.pythonVersion ?? '—'}</TableCell>
                      <TableCell>
                        {v.isLatest ? (
                          <Badge variant="default">Latest</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(v.status ?? 'active')}>
                          {statusLabel(v.status ?? 'active')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(v)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteDialogId(v.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm) } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑版本' : '新增版本'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>版本标签 *</Label>
                <Input value={form.versionTag} onChange={(e) => setForm({ ...form, versionTag: e.target.value })} placeholder="例：2.4.0-cuda12.4" className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label>显示标签</Label>
                <Input value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} placeholder="例：PyTorch 2.4 + CUDA 12.4" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>完整镜像引用 *</Label>
              <Input value={form.fullImageRef} onChange={(e) => setForm({ ...form, fullImageRef: e.target.value })} placeholder="registry.gongji.cloud/.../pytorch:2.4.0-cuda12.4" className="font-mono text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>CUDA 版本</Label>
                <Input value={form.cudaVersion} onChange={(e) => setForm({ ...form, cudaVersion: e.target.value })} placeholder="12.4" />
              </div>
              <div className="space-y-2">
                <Label>OS 版本</Label>
                <Input value={form.osVersion} onChange={(e) => setForm({ ...form, osVersion: e.target.value })} placeholder="Ubuntu 22.04" />
              </div>
              <div className="space-y-2">
                <Label>Python 版本</Label>
                <Input value={form.pythonVersion} onChange={(e) => setForm({ ...form, pythonVersion: e.target.value })} placeholder="3.11" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>大小（字节）</Label>
                <Input type="number" value={form.sizeBytes} onChange={(e) => setForm({ ...form, sizeBytes: e.target.value })} placeholder="字节数" />
                {form.sizeBytes && (
                  <p className="text-xs text-muted-foreground">≈ {formatSize(form.sizeBytes)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>SHA256 摘要</Label>
                <Input value={form.digestSha256} onChange={(e) => setForm({ ...form, digestSha256: e.target.value })} placeholder="sha256:..." className="font-mono text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.requiresGPU} onCheckedChange={(v) => setForm({ ...form, requiresGPU: v })} />
                <Label>需要 GPU</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isLatest} onCheckedChange={(v) => setForm({ ...form, isLatest: v })} />
                <Label>Latest</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>最低 GPU 显存（MiB）</Label>
                <Input type="number" value={form.minGpuMemory} onChange={(e) => setForm({ ...form, minGpuMemory: e.target.value })} placeholder="MiB" />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>发布日期</Label>
                <Input type="date" value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>废弃日期</Label>
                <Input type="date" value={form.deprecationDate} onChange={(e) => setForm({ ...form, deprecationDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>废弃提示</Label>
              <Input value={form.deprecationMessage} onChange={(e) => setForm({ ...form, deprecationMessage: e.target.value })} placeholder="废弃原因或迁移建议" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.versionTag.trim() || !form.fullImageRef.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除此版本吗？删除后用户将无法选择此版本。此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogId(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteDialogId) deleteMutation.mutate({ id: deleteDialogId }) }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
