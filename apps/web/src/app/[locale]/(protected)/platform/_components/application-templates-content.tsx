'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Search, AppWindow, Star } from 'lucide-react'
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
import { Textarea } from '@workspace/ui/components/textarea'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

interface AppTemplateForm {
  name: string
  category: string
  description: string
  imageRef: string
  minGPU: string
  minGPUCount: number
  minMemoryGB: string
  minDiskGB: number
  defaultPort: number
  defaultCommand: string
  defaultEnvVars: string
  healthCheckPath: string
  docsUrl: string
  sourceUrl: string
  deployType: string
  isFeatured: boolean
  sortOrder: number
  tier: string
  status: string
}

const emptyForm: AppTemplateForm = {
  name: '',
  category: '',
  description: '',
  imageRef: '',
  minGPU: '',
  minGPUCount: 0,
  minMemoryGB: '',
  minDiskGB: 0,
  defaultPort: 8080,
  defaultCommand: '',
  defaultEnvVars: '{}',
  healthCheckPath: '',
  docsUrl: '',
  sourceUrl: '',
  deployType: 'instance',
  isFeatured: false,
  sortOrder: 0,
  tier: 'community',
  status: 'active',
}

const reviewStatusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  pending: { label: '待审核', variant: 'secondary' },
  approved: { label: '已通过', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'destructive' },
}

const tierConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' }> = {
  official: { label: '官方', variant: 'default' },
  verified: { label: '认证', variant: 'secondary' },
  community: { label: '社区', variant: 'outline' },
}

const categoryOptions = ['llm', 'image', 'audio', 'video', 'dev']

export function ApplicationTemplatesContent() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [deployTypeFilter, setDeployTypeFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AppTemplateForm>(emptyForm)

  const utils = trpc.useUtils()

  const queryInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      deployType: deployTypeFilter === 'all' ? undefined : deployTypeFilter,
      tier: tierFilter === 'all' ? undefined : tierFilter,
      reviewStatus: reviewStatusFilter === 'all' ? undefined : reviewStatusFilter,
      page,
      pageSize: 20,
    }),
    [search, categoryFilter, deployTypeFilter, tierFilter, reviewStatusFilter, page],
  )

  const { data, isLoading, isFetching } = trpc.admin.applicationTemplate.list.useQuery(queryInput)
  const { data: categories } = trpc.admin.applicationTemplate.listCategories.useQuery()

  const createMutation = trpc.admin.applicationTemplate.create.useMutation({
    onSuccess: () => {
      utils.admin.applicationTemplate.list.invalidate()
      setDialogOpen(false)
      setForm(emptyForm)
      toast.success('模板已创建')
    },
    onError: (e) => toast.error(e.message),
  })

  const updateMutation = trpc.admin.applicationTemplate.update.useMutation({
    onSuccess: () => {
      utils.admin.applicationTemplate.list.invalidate()
      setDialogOpen(false)
      setEditingId(null)
      setForm(emptyForm)
      toast.success('模板已更新')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = trpc.admin.applicationTemplate.delete.useMutation({
    onSuccess: () => {
      utils.admin.applicationTemplate.list.invalidate()
      setDeleteDialogId(null)
      toast.success('模板已删除')
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  const allCategories = useMemo(() => {
    const serverCategories = categories ?? []
    const merged = new Set([...categoryOptions, ...serverCategories])
    return Array.from(merged)
  }, [categories])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(template: (typeof items)[number]) {
    setEditingId(template.id)
    setForm({
      name: template.name,
      category: template.category ?? '',
      description: template.description ?? '',
      imageRef: template.imageRef ?? '',
      minGPU: template.minGPU ?? '',
      minGPUCount: template.minGPUCount ?? 0,
      minMemoryGB: template.minMemoryGB?.toString() ?? '',
      minDiskGB: template.minDiskGB ?? 0,
      defaultPort: template.defaultPort ?? 8080,
      defaultCommand: template.defaultCommand ?? '',
      defaultEnvVars: typeof template.defaultEnvVars === 'string' ? template.defaultEnvVars : JSON.stringify(template.defaultEnvVars ?? {}),
      healthCheckPath: template.healthCheckPath ?? '',
      docsUrl: template.docsUrl ?? '',
      sourceUrl: template.sourceUrl ?? '',
      deployType: template.deployType ?? 'instance',
      isFeatured: template.isFeatured ?? false,
      sortOrder: template.sortOrder ?? 0,
      tier: template.tier ?? 'community',
      status: template.status ?? 'active',
    })
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!form.name.trim()) return

    const commonFields = {
      description: form.description.trim() || undefined,
      minGPU: form.minGPU.trim() || undefined,
      minGPUCount: form.minGPUCount || undefined,
      minMemoryGB: form.minMemoryGB ? Number(form.minMemoryGB) : undefined,
      minDiskGB: form.minDiskGB || undefined,
      defaultPort: form.defaultPort || undefined,
      defaultCommand: form.defaultCommand.trim() || undefined,
      defaultEnvVars: form.defaultEnvVars.trim()
        ? (() => { try { return JSON.parse(form.defaultEnvVars) as Record<string, string> } catch { return undefined } })()
        : undefined,
      healthCheckPath: form.healthCheckPath.trim() || undefined,
      docsUrl: form.docsUrl.trim() || undefined,
      sourceUrl: form.sourceUrl.trim() || undefined,
      deployType: form.deployType,
      isFeatured: form.isFeatured,
      sortOrder: form.sortOrder,
      tier: form.tier,
      status: form.status,
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        imageRef: form.imageRef.trim() || undefined,
        ...commonFields,
      })
    } else {
      createMutation.mutate({
        name: form.name.trim(),
        category: form.category.trim(),
        imageRef: form.imageRef.trim(),
        ...commonFields,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AppWindow className="size-6" />
            应用模板管理
          </h1>
          <p className="text-muted-foreground text-sm mt-1">管理应用模板，配置部署参数与资源需求</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          新建模板
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索名称…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deployTypeFilter} onValueChange={(v) => { setDeployTypeFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="部署类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="instance">实例</SelectItem>
              <SelectItem value="serverless">Serverless</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="层级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部层级</SelectItem>
              <SelectItem value="official">官方</SelectItem>
              <SelectItem value="verified">认证</SelectItem>
              <SelectItem value="community">社区</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reviewStatusFilter} onValueChange={(v) => { setReviewStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="审核状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待审核</SelectItem>
              <SelectItem value="approved">已通过</SelectItem>
              <SelectItem value="rejected">已拒绝</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

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
                  <TableHead>名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>镜像</TableHead>
                  <TableHead>部署类型</TableHead>
                  <TableHead>层级</TableHead>
                  <TableHead>推荐</TableHead>
                  <TableHead>审核状态</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      暂无模板
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((t) => {
                    const reviewCfg = reviewStatusConfig[t.reviewStatus] ?? { label: '待审核', variant: 'secondary' as const }
                    const tierCfg = tierConfig[t.tier] ?? { label: '社区', variant: 'outline' as const }
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>
                          {t.category ? <Badge variant="secondary">{t.category}</Badge> : '—'}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[200px] block">
                            {t.imageRef ?? '—'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{t.deployType ?? 'instance'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tierCfg.variant}>{tierCfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {t.isFeatured ? (
                            <Badge variant="default" className="gap-1">
                              <Star className="size-3" />
                              推荐
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={reviewCfg.variant}>{reviewCfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'active' ? 'default' : 'outline'}>
                            {t.status === 'active' ? '启用' : '禁用'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(t)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteDialogId(t.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 条{isFetching && !isLoading ? '（刷新中…）' : ''}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm) } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑模板' : '新建模板'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="模板名称" />
              </div>
              <div className="space-y-2">
                <Label>分类</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="模板描述"
                rows={2}
              />
            </div>

            {/* Image & Registry */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>镜像引用 (imageRef)</Label>
                <Input value={form.imageRef} onChange={(e) => setForm({ ...form, imageRef: e.target.value })} placeholder="镜像地址" className="font-mono text-sm" />
              </div>
            </div>

            {/* Resource Requirements */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>最低 GPU 型号</Label>
                <Input value={form.minGPU} onChange={(e) => setForm({ ...form, minGPU: e.target.value })} placeholder="例：A100" />
              </div>
              <div className="space-y-2">
                <Label>最低 GPU 数量</Label>
                <Input type="number" value={form.minGPUCount} onChange={(e) => setForm({ ...form, minGPUCount: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>最低内存 (GB)</Label>
                <Input value={form.minMemoryGB} onChange={(e) => setForm({ ...form, minMemoryGB: e.target.value })} placeholder="例：16" />
              </div>
              <div className="space-y-2">
                <Label>最低磁盘 (GB)</Label>
                <Input type="number" value={form.minDiskGB} onChange={(e) => setForm({ ...form, minDiskGB: Number(e.target.value) })} />
              </div>
            </div>

            {/* Runtime Defaults */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>默认端口</Label>
                <Input type="number" value={form.defaultPort} onChange={(e) => setForm({ ...form, defaultPort: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>健康检查路径</Label>
                <Input value={form.healthCheckPath} onChange={(e) => setForm({ ...form, healthCheckPath: e.target.value })} placeholder="/health" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>默认启动命令</Label>
              <Textarea
                value={form.defaultCommand}
                onChange={(e) => setForm({ ...form, defaultCommand: e.target.value })}
                placeholder="启动命令"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>默认环境变量 (JSON)</Label>
              <Textarea
                value={form.defaultEnvVars}
                onChange={(e) => setForm({ ...form, defaultEnvVars: e.target.value })}
                placeholder='{"KEY": "VALUE"}'
                rows={3}
                className="font-mono text-sm"
              />
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>文档地址</Label>
                <Input value={form.docsUrl} onChange={(e) => setForm({ ...form, docsUrl: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>源码地址</Label>
                <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://..." />
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>部署类型</Label>
                <Select value={form.deployType} onValueChange={(v) => setForm({ ...form, deployType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instance">实例</SelectItem>
                    <SelectItem value="serverless">Serverless</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>层级</Label>
                <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official">官方</SelectItem>
                    <SelectItem value="verified">认证</SelectItem>
                    <SelectItem value="community">社区</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="inactive">禁用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.isFeatured} onCheckedChange={(v) => setForm({ ...form, isFeatured: v })} />
              <Label>推荐模板</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
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
            确定要删除此模板吗？删除后用户将无法在部署时选择此模板。此操作不可撤销。
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
