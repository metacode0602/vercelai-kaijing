'use client'

import { useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Pencil, Trash2, Search, Layers, GitBranch, PlusCircle, XCircle, Code, FormInput } from 'lucide-react'
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
import { Textarea } from '@workspace/ui/components/textarea'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

interface RecommendedConfig {
  command: string
  ports: number[]
  envVars: Record<string, string>
  gpu: { type: string; count: number }
  scaling: { minInstances: number; maxInstances: number }
}

const DEFAULT_RECOMMENDED_CONFIG: RecommendedConfig = {
  command: '',
  ports: [8080],
  envVars: {},
  gpu: { type: '', count: 1 },
  scaling: { minInstances: 1, maxInstances: 1 },
}

const GPU_PRESETS = [
  'A100-80G',
  'A100-40G',
  'H100-80G',
  'H800-80G',
  'L40S-48G',
  'RTX 4090-24G',
  'RTX 4090D-48G',
  'V100-32G',
  'V100-16G',
  'A10-24G',
  'A30-24G',
  'RTX A6000-48G',
  'RTX A5000-24G',
  'RTX A4000-16G',
]

const CATEGORY_PRESETS = [
  { value: 'framework', label: '框架 (Framework)' },
  { value: 'os', label: '操作系统 (OS)' },
  { value: 'tool', label: '工具 (Tool)' },
  { value: 'language', label: '语言运行时 (Language)' },
  { value: 'database', label: '数据库 (Database)' },
  { value: 'inference', label: '推理服务 (Inference)' },
] as const

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_PRESETS.map((c) => [c.value, c.label]),
)

interface BaseImageForm {
  name: string
  displayName: string
  description: string
  category: string
  tags: string
  iconUrl: string
  sortOrder: number
  status: string
  recommendedConfig: RecommendedConfig
}

const emptyForm: BaseImageForm = {
  name: '',
  displayName: '',
  description: '',
  category: '',
  tags: '',
  iconUrl: '',
  sortOrder: 0,
  status: 'active',
  recommendedConfig: { ...DEFAULT_RECOMMENDED_CONFIG, envVars: {}, ports: [8080] },
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

function categoryLabel(value: string) {
  return CATEGORY_LABELS[value] ?? value
}

export function BaseImagesContent() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BaseImageForm>(emptyForm)
  const [configJsonView, setConfigJsonView] = useState(false)

  const utils = trpc.useUtils()

  const queryInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      page,
      pageSize: 20,
    }),
    [search, categoryFilter, statusFilter, page],
  )

  const { data, isLoading, isFetching } = trpc.admin.baseImage.list.useQuery(queryInput)
  const { data: categories } = trpc.admin.baseImage.listCategories.useQuery()

  const createMutation = trpc.admin.baseImage.create.useMutation({
    onSuccess: () => {
      utils.admin.baseImage.list.invalidate()
      setDialogOpen(false)
      setForm(emptyForm)
      toast.success('镜像已创建')
    },
    onError: (e) => toast.error(e.message),
  })

  const updateMutation = trpc.admin.baseImage.update.useMutation({
    onSuccess: () => {
      utils.admin.baseImage.list.invalidate()
      setDialogOpen(false)
      setEditingId(null)
      setForm(emptyForm)
      toast.success('镜像已更新')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = trpc.admin.baseImage.delete.useMutation({
    onSuccess: () => {
      utils.admin.baseImage.list.invalidate()
      setDeleteDialogId(null)
      toast.success('镜像已删除')
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, recommendedConfig: { ...DEFAULT_RECOMMENDED_CONFIG } })
    setConfigJsonView(false)
    setDialogOpen(true)
  }

  function openEdit(image: (typeof items)[number]) {
    setEditingId(image.id)
    const rc = image.recommendedConfig as Record<string, unknown> | null
    const parsed: RecommendedConfig = {
      command: typeof rc?.command === 'string' ? rc.command : '',
      ports: Array.isArray(rc?.ports) ? (rc.ports as number[]) : [8080],
      envVars: rc?.envVars && typeof rc.envVars === 'object' && !Array.isArray(rc.envVars)
        ? Object.fromEntries(
            Object.entries(rc.envVars as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
          )
        : {},
      gpu: rc?.gpu && typeof rc.gpu === 'object'
        ? {
            type: typeof (rc.gpu as Record<string, unknown>).type === 'string' ? (rc.gpu as Record<string, unknown>).type as string : '',
            count: typeof (rc.gpu as Record<string, unknown>).count === 'number' ? (rc.gpu as Record<string, unknown>).count as number : 1,
          }
        : { type: '', count: 1 },
      scaling: rc?.scaling && typeof rc.scaling === 'object'
        ? {
            minInstances: typeof (rc.scaling as Record<string, unknown>).minInstances === 'number' ? (rc.scaling as Record<string, unknown>).minInstances as number : 1,
            maxInstances: typeof (rc.scaling as Record<string, unknown>).maxInstances === 'number' ? (rc.scaling as Record<string, unknown>).maxInstances as number : 1,
          }
        : { minInstances: 1, maxInstances: 1 },
    }
    setForm({
      name: image.name,
      displayName: image.displayName ?? '',
      description: image.description ?? '',
      category: image.category ?? '',
      tags: (image.tags ?? []).join(', '),
      iconUrl: image.iconUrl ?? '',
      sortOrder: image.sortOrder ?? 0,
      status: image.status ?? 'active',
      recommendedConfig: parsed,
    })
    setConfigJsonView(false)
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!form.name.trim()) return

    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const rc = form.recommendedConfig
    const hasConfig = rc.command || rc.gpu.type || Object.keys(rc.envVars).length > 0
    const recommendedConfig: Record<string, unknown> | undefined = hasConfig
      ? {
          ...(rc.command && { command: rc.command }),
          ...(rc.ports.length > 0 && { ports: rc.ports }),
          ...(Object.keys(rc.envVars).length > 0 && { envVars: rc.envVars }),
          gpu: { type: rc.gpu.type, count: rc.gpu.count },
          scaling: { minInstances: rc.scaling.minInstances, maxInstances: rc.scaling.maxInstances },
        }
      : undefined

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name.trim(),
        displayName: form.displayName.trim() || undefined,
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        tags,
        iconUrl: form.iconUrl.trim() || undefined,
        sortOrder: form.sortOrder,
        status: form.status,
        recommendedConfig,
      })
    } else {
      createMutation.mutate({
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim(),
        tags,
        iconUrl: form.iconUrl.trim() || undefined,
        sortOrder: form.sortOrder,
        status: form.status,
        recommendedConfig,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="size-6" />
            基础镜像管理
          </h1>
          <p className="text-muted-foreground text-sm mt-1">管理基础镜像元数据与推荐部署配置，供用户在部署时选择基础环境</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          新建镜像
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索名称、显示名…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {CATEGORY_PRESETS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
              {categories?.filter((c) => !CATEGORY_LABELS[c]).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
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
                  <TableHead>显示名</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead>推荐配置</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      暂无镜像
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((img) => {
                    const hasConfig = img.recommendedConfig && Object.keys(img.recommendedConfig).length > 0
                    return (
                      <TableRow key={img.id}>
                        <TableCell className="font-medium">{img.name}</TableCell>
                        <TableCell>{img.displayName ?? '—'}</TableCell>
                        <TableCell>
                          {img.category ? <Badge variant="secondary">{categoryLabel(img.category)}</Badge> : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(img.tags ?? []).length > 0 ? (
                              (img.tags ?? []).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                              ))
                            ) : '—'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasConfig ? (
                            <Badge variant="default" className="text-xs">已配置</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">未配置</span>
                          )}
                        </TableCell>
                        <TableCell>{img.sortOrder ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(img.status ?? 'active')}>
                            {statusLabel(img.status ?? 'active')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" asChild>
                              <Link href={`/platform/images/base/${img.id}`} title="管理版本">
                                <GitBranch className="size-3.5" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(img)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteDialogId(img.id)}>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑镜像' : '新建镜像'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">基本信息</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>名称 *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：pytorch-cuda" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>显示名 *</Label>
                  <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="例：PyTorch + CUDA" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="基础镜像描述" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>分类 *</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_PRESETS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>图标 URL</Label>
                  <Input value={form.iconUrl} onChange={(e) => setForm({ ...form, iconUrl: e.target.value })} placeholder="https://..." className="font-mono text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>标签（逗号分隔）</Label>
                  <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="cuda, pytorch, python" />
                </div>
                <div className="space-y-2">
                  <Label>排序</Label>
                  <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
                </div>
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

            {/* Recommended Config */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">推荐部署配置</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    预填此镜像的推荐启动命令、端口、GPU 等配置，用户选择此镜像时自动应用
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigJsonView(!configJsonView)}
                >
                  {configJsonView ? <FormInput className="size-4 mr-1" /> : <Code className="size-4 mr-1" />}
                  {configJsonView ? '表单模式' : 'JSON 预览'}
                </Button>
              </div>

              {configJsonView ? (
                <div className="space-y-2">
                  <pre className="text-xs font-mono bg-muted rounded-md p-4 overflow-x-auto max-h-80 overflow-y-auto">
                    {JSON.stringify(
                      {
                        ...(form.recommendedConfig.command && { command: form.recommendedConfig.command }),
                        ...(form.recommendedConfig.ports.length > 0 && { ports: form.recommendedConfig.ports }),
                        ...(Object.keys(form.recommendedConfig.envVars).length > 0 && { envVars: form.recommendedConfig.envVars }),
                        gpu: form.recommendedConfig.gpu,
                        scaling: form.recommendedConfig.scaling,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Command */}
                  <div className="space-y-2">
                    <Label>启动命令</Label>
                    <Input
                      value={form.recommendedConfig.command}
                      onChange={(e) => setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, command: e.target.value } })}
                      placeholder="例：python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2-7B"
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Ports */}
                  <div className="space-y-2">
                    <Label>监听端口</Label>
                    <div className="flex flex-wrap gap-2">
                      {form.recommendedConfig.ports.map((port, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={port}
                            onChange={(e) => {
                              const ports = [...form.recommendedConfig.ports]
                              ports[idx] = Number(e.target.value) || 0
                              setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, ports } })
                            }}
                            className="w-24 font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            onClick={() => {
                              const ports = form.recommendedConfig.ports.filter((_, i) => i !== idx)
                              setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, ports } })
                            }}
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, ports: [...form.recommendedConfig.ports, 8080] } })}
                      >
                        <PlusCircle className="size-3.5 mr-1" />
                        添加端口
                      </Button>
                    </div>
                  </div>

                  {/* EnvVars */}
                  <div className="space-y-2">
                    <Label>环境变量</Label>
                    <div className="space-y-2">
                      {Object.entries(form.recommendedConfig.envVars).map(([key, val], idx, entries) => (
                        <div key={`${idx}-${key}`} className="flex items-center gap-2">
                          <Input
                            value={key}
                            onChange={(e) => {
                              const newEnvVars: Record<string, string> = {}
                              for (let i = 0; i < entries.length; i++) {
                                const entry = entries[i]!
                                newEnvVars[i === idx ? e.target.value : entry[0]] = entry[1]
                              }
                              setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, envVars: newEnvVars } })
                            }}
                            placeholder="KEY"
                            className="font-mono text-sm flex-1"
                          />
                          <span className="text-muted-foreground">=</span>
                          <Input
                            value={val}
                            onChange={(e) => {
                              const newEnvVars: Record<string, string> = {}
                              for (let i = 0; i < entries.length; i++) {
                                const entry = entries[i]!
                                newEnvVars[entry[0]] = i === idx ? e.target.value : entry[1]
                              }
                              setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, envVars: newEnvVars } })
                            }}
                            placeholder="value"
                            className="font-mono text-sm flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            onClick={() => {
                              const newEnvVars: Record<string, string> = {}
                              for (let i = 0; i < entries.length; i++) {
                                const entry = entries[i]!
                                if (i !== idx) newEnvVars[entry[0]] = entry[1]
                              }
                              setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, envVars: newEnvVars } })
                            }}
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const envVars = { ...form.recommendedConfig.envVars }
                          let newKey = 'NEW_KEY'
                          let i = 1
                          while (newKey in envVars) { newKey = `NEW_KEY_${i++}` }
                          envVars[newKey] = ''
                          setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, envVars } })
                        }}
                      >
                        <PlusCircle className="size-3.5 mr-1" />
                        添加环境变量
                      </Button>
                    </div>
                  </div>

                  {/* GPU */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>GPU 型号</Label>
                      <Select
                        value={form.recommendedConfig.gpu.type}
                        onValueChange={(v) => setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, gpu: { ...form.recommendedConfig.gpu, type: v } } })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择 GPU 型号" />
                        </SelectTrigger>
                        <SelectContent>
                          {GPU_PRESETS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>GPU 数量</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.recommendedConfig.gpu.count}
                        onChange={(e) => setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, gpu: { ...form.recommendedConfig.gpu, count: Number(e.target.value) || 0 } } })}
                      />
                    </div>
                  </div>

                  {/* Scaling */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>最小实例数</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.recommendedConfig.scaling.minInstances}
                        onChange={(e) => setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, scaling: { ...form.recommendedConfig.scaling, minInstances: Number(e.target.value) || 0 } } })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>最大实例数</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.recommendedConfig.scaling.maxInstances}
                        onChange={(e) => setForm({ ...form, recommendedConfig: { ...form.recommendedConfig, scaling: { ...form.recommendedConfig.scaling, maxInstances: Number(e.target.value) || 0 } } })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || !form.displayName.trim() || !form.category || createMutation.isPending || updateMutation.isPending}
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
            确定要删除此基础镜像吗？删除后用户将无法选择此镜像，关联的版本信息也将被删除。此操作不可撤销。
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
