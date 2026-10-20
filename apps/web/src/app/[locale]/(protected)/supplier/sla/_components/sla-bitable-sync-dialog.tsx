'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconLoader2, IconRefresh, IconTable } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Switch } from '@workspace/ui/components/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import { trpc } from '@/lib/trpc/client'
import { SLA_SYNC_KIND_LABELS } from '@/lib/types/sla'
import type {
  SlaBitableFieldMapping,
  SlaBitablePreviewResult,
  SlaBitablePreviewRow,
  SlaBitableSyncConfigDto,
  SlaBitableSyncKind,
} from '@/lib/types/sla-bitable-import'
import {
  SLA_BITABLE_SYNC_KINDS,
  SLA_CANONICAL_HEADERS_BY_KIND,
  SLA_REQUIRED_HEADERS_BY_KIND,
} from '@/lib/types/sla-bitable-import'

function formatDt(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function statusBadge(status: string) {
  const labels: Record<string, string> = {
    success: '成功',
    failed: '失败',
    running: '运行中',
    skipped: '跳过',
    partial: '部分成功',
  }
  const variant =
    status === 'success'
      ? 'default'
      : status === 'failed'
        ? 'destructive'
        : status === 'partial'
          ? 'secondary'
          : 'outline'
  return <Badge variant={variant}>{labels[status] ?? status}</Badge>
}

function parseStatusBadge(status: SlaBitablePreviewRow['parseStatus']) {
  const labels = { ok: '正常', warning: '警告', error: '错误' } as const
  const variant =
    status === 'ok' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'
  return <Badge variant={variant}>{labels[status]}</Badge>
}

function actionLabel(action: SlaBitablePreviewRow['action']) {
  if (action === 'create') return '新建'
  if (action === 'update') return '更新'
  return '跳过'
}

function SlaBitableSyncConfigDialog({
  open,
  onOpenChange,
  initial,
  defaultSyncKind,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: SlaBitableSyncConfigDto | null
  defaultSyncKind?: SlaBitableSyncKind
  onSaved: () => void
}) {
  const utils = trpc.useUtils()
  const [step, setStep] = useState<1 | 2>(1)
  const [syncKind, setSyncKind] = useState<SlaBitableSyncKind>('platform_offline_baremetal')
  const [name, setName] = useState('')
  const [appToken, setAppToken] = useState('')
  const [tableId, setTableId] = useState('')
  const [viewId, setViewId] = useState('')
  const [filterFormula, setFilterFormula] = useState('')
  const [cronExpr, setCronExpr] = useState('0 * * * *')
  const [autoCommit, setAutoCommit] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [fieldMapping, setFieldMapping] = useState<SlaBitableFieldMapping>({})
  const [bitableFields, setBitableFields] = useState<
    Array<{ fieldId: string; fieldName: string; suggestedCanonicalHeader: string | null }>
  >([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [fieldsError, setFieldsError] = useState<string | null>(null)

  const listFieldsMutation = trpc.supplier.sla.bitableImport.listTableFields.useMutation()
  const upsertMutation = trpc.supplier.sla.bitableImport.upsertConfig.useMutation({
    onSuccess: () => {
      toast.success('同步配置已保存')
      void utils.supplier.sla.bitableImport.listConfigs.invalidate()
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => toast.error(error.message),
  })

  useEffect(() => {
    if (!open) return
    setStep(1)
    setSyncKind(initial?.syncKind ?? defaultSyncKind ?? 'platform_offline_baremetal')
    setName(initial?.name ?? '')
    setAppToken(initial?.appToken ?? '')
    setTableId(initial?.tableId ?? '')
    setViewId(initial?.viewId ?? '')
    setFilterFormula(initial?.filterFormula ?? '')
    setCronExpr(initial?.cronExpr ?? '0 * * * *')
    setAutoCommit(initial?.autoCommit ?? false)
    setEnabled(initial?.enabled ?? true)
    setFieldMapping(initial?.fieldMappingJson ?? {})
    setBitableFields([])
    setFieldsError(null)
  }, [open, initial, defaultSyncKind])

  const canonicalHeaders = SLA_CANONICAL_HEADERS_BY_KIND[syncKind]
  const requiredHeaders = SLA_REQUIRED_HEADERS_BY_KIND[syncKind]
  const missingRequired = requiredHeaders.filter((h) => !fieldMapping[h])

  const loadFields = async (goToStep2: boolean) => {
    if (!appToken.trim() || !tableId.trim()) {
      setFieldsError('请先填写 app_token 与 table_id')
      return
    }
    setFieldsLoading(true)
    setFieldsError(null)
    try {
      const result = await listFieldsMutation.mutateAsync({
        syncKind,
        appToken: appToken.trim(),
        tableId: tableId.trim(),
      })
      setBitableFields(result.fields)
      if (!initial?.id || Object.keys(fieldMapping).length === 0) {
        setFieldMapping(result.suggestedMapping)
      }
      toast.success(`已识别 ${result.fields.length} 个字段，自动匹配 ${Object.keys(result.suggestedMapping).length} 列`)
      if (goToStep2) setStep(2)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '拉取字段失败'
      setFieldsError(msg)
      toast.error(msg)
    } finally {
      setFieldsLoading(false)
    }
  }

  const onSave = () => {
    if (!name.trim()) {
      toast.error('请填写配置名称')
      return
    }
    if (missingRequired.length > 0) {
      toast.error(`缺少必填映射：${missingRequired.join('、')}`)
      return
    }
    upsertMutation.mutate({
      id: initial?.id,
      syncKind,
      name: name.trim(),
      appToken: appToken.trim(),
      tableId: tableId.trim(),
      viewId: viewId.trim() || null,
      filterFormula: filterFormula.trim() || null,
      fieldMappingJson: fieldMapping as Record<string, string>,
      cronExpr: cronExpr.trim(),
      autoCommit,
      enabled,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl min-w-[30vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? '编辑同步配置' : '新建同步配置'}</DialogTitle>
          <DialogDescription>
            步骤 {step}/2 · {step === 1 ? '连接与调度' : '字段映射'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>数据集 *</Label>
              <Select
                value={syncKind}
                onValueChange={(v) => setSyncKind(v as SlaBitableSyncKind)}
                disabled={Boolean(initial?.id)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLA_BITABLE_SYNC_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {SLA_SYNC_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>配置名称 *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SLA 故障表" />
            </div>
            <div className="space-y-2">
              <Label>app_token *</Label>
              <Input value={appToken} onChange={(e) => setAppToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>table_id *</Label>
              <Input value={tableId} onChange={(e) => setTableId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>view_id</Label>
              <Input value={viewId} onChange={(e) => setViewId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>筛选公式</Label>
              <Input value={filterFormula} onChange={(e) => setFilterFormula(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>启用定时</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <Label>自动入库</Label>
              <Switch checked={autoCommit} onCheckedChange={setAutoCommit} />
            </div>
            <div className="space-y-2">
              <Label>Cron</Label>
              <Input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
            </div>
            {fieldsError ? (
              <p className="text-sm text-destructive whitespace-pre-line">{fieldsError}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {canonicalHeaders.map((header) => (
              <div key={header} className="grid grid-cols-2 gap-2 items-center">
                <Label className="font-mono text-xs">
                  {header}
                  {requiredHeaders.includes(header) ? ' *' : ''}
                </Label>
                <Select
                  value={fieldMapping[header] ?? ''}
                  onValueChange={(value) => setFieldMapping((prev) => ({ ...prev, [header]: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择飞书字段" />
                  </SelectTrigger>
                  <SelectContent>
                    {bitableFields.map((field) => (
                      <SelectItem key={field.fieldId} value={field.fieldId}>
                        {field.fieldName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button variant="outline" disabled={fieldsLoading} onClick={() => void loadFields(true)}>
                {fieldsLoading ? <IconLoader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                下一步
              </Button>
              <Button disabled={fieldsLoading} onClick={() => void loadFields(false)}>
                拉取字段
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                上一步
              </Button>
              <Button onClick={onSave} disabled={upsertMutation.isPending || missingRequired.length > 0}>
                {upsertMutation.isPending ? <IconLoader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                保存配置
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewRowSummary({ row, syncKind }: { row: SlaBitablePreviewRow; syncKind: SlaBitableSyncKind }) {
  if (syncKind === 'platform_offline_baremetal') {
    return (
      <>
        <TableCell>{row.customerFullName ?? '—'}</TableCell>
        <TableCell className="text-right tabular-nums">{row.impactMinutes ?? '—'}</TableCell>
      </>
    )
  }
  if (syncKind === 'platform_online_incident') {
    return (
      <>
        <TableCell>{row.tenantPlatformId ?? '—'}</TableCell>
        <TableCell className="text-right tabular-nums">{row.impactMinutes ?? '—'}</TableCell>
      </>
    )
  }
  if (syncKind === 'platform_internal_usage') {
    return (
      <>
        <TableCell>{row.userName ?? '—'}</TableCell>
        <TableCell className="text-right tabular-nums">{row.totalAmount ?? '—'}</TableCell>
      </>
    )
  }
  return (
    <>
      <TableCell>{row.contractNo ?? '—'}</TableCell>
      <TableCell>{row.supplierLabel ?? row.supplierCode ?? '—'}</TableCell>
    </>
  )
}

function SlaBitablePreviewPanel({
  preview,
  onCommitted,
}: {
  preview: SlaBitablePreviewResult
  onCommitted: () => void
}) {
  const utils = trpc.useUtils()
  const selectableRows = preview.rows.filter((r) => r.selectable)
  const [selected, setSelected] = useState<Set<number>>(() => new Set(selectableRows.map((r) => r.rowNo)))

  const commitMutation = trpc.supplier.sla.bitableImport.commitPreview.useMutation({
    onSuccess: (result) => {
      toast.success(`入库完成：新建 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`)
      void utils.supplier.sla.bitableImport.listConfigs.invalidate()
      onCommitted()
    },
    onError: (error) => toast.error(error.message),
  })

  const toggle = (rowNo: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(rowNo)
      else next.delete(rowNo)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(selectableRows.map((r) => r.rowNo)) : new Set())
  }

  const commitRows = preview.rows.filter((r) => selected.has(r.rowNo))

  const previewHeadExtra =
    preview.syncKind === 'platform_offline_baremetal'
      ? ['客户', '影响分钟']
      : preview.syncKind === 'platform_online_incident'
        ? ['租户 ID', '影响分钟']
        : preview.syncKind === 'platform_internal_usage'
          ? ['使用人', '合计金额']
          : ['合同号', '供应商']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{SLA_SYNC_KIND_LABELS[preview.syncKind]}</Badge>
        <span className="text-sm text-muted-foreground">{preview.configName}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          ['源记录', preview.recordCount],
          ['解析行', preview.sourceRowCount],
          ['可入库', preview.okCount],
          ['警告', preview.warningCount],
          ['错误', preview.errorCount],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{val}</p>
          </div>
        ))}
      </div>

      {preview.parseError ? <p className="text-sm text-destructive">{preview.parseError}</p> : null}
      {preview.missingRequiredHeaders.length > 0 ? (
        <p className="text-sm text-destructive">
          缺少必填列：{preview.missingRequiredHeaders.join('、')}
        </p>
      ) : null}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selectableRows.length > 0 && selected.size === selectableRows.length}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  disabled={selectableRows.length === 0}
                />
              </TableHead>
              <TableHead>行</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>机房</TableHead>
              {previewHeadExtra.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
              <TableHead>说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7 + previewHeadExtra.length} className="text-center text-muted-foreground py-8">
                  无解析行
                </TableCell>
              </TableRow>
            ) : (
              preview.rows.map((row) => (
                <TableRow key={row.rowNo}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.rowNo)}
                      disabled={!row.selectable}
                      onCheckedChange={(v) => toggle(row.rowNo, v === true)}
                    />
                  </TableCell>
                  <TableCell>{row.rowNo}</TableCell>
                  <TableCell>{actionLabel(row.action)}</TableCell>
                  <TableCell>{parseStatusBadge(row.parseStatus)}</TableCell>
                  <TableCell>{row.dataCenterLabel ?? '—'}</TableCell>
                  <PreviewRowSummary row={row} syncKind={preview.syncKind} />
                  <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                    {row.messages[0] ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          disabled={commitMutation.isPending || commitRows.length === 0}
          onClick={() =>
            commitMutation.mutate({
              batchId: preview.batchId,
              syncKind: preview.syncKind,
              rows: commitRows,
            })
          }
        >
          {commitMutation.isPending ? <IconLoader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          确认入库 {commitRows.length} 条
        </Button>
      </div>
    </div>
  )
}

export function SlaBitableSyncDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [tab, setTab] = useState('config')
  const [syncKindFilter, setSyncKindFilter] = useState<'all' | SlaBitableSyncKind>('all')
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SlaBitableSyncConfigDto | null>(null)
  const [preview, setPreview] = useState<SlaBitablePreviewResult | null>(null)
  const [jobConfigId, setJobConfigId] = useState<string | null>(null)

  const { data: configs = [], isLoading, refetch } =
    trpc.supplier.sla.bitableImport.listConfigs.useQuery(undefined, { enabled: open })

  const filteredConfigs = useMemo(() => {
    if (syncKindFilter === 'all') return configs
    return configs.filter((c) => c.syncKind === syncKindFilter)
  }, [configs, syncKindFilter])

  const { data: jobRuns, refetch: refetchJobs } =
    trpc.supplier.sla.bitableImport.listJobRuns.useQuery(
      { configId: jobConfigId ?? undefined, limit: 10 },
      { enabled: open && tab === 'history' },
    )

  const previewMutation = trpc.supplier.sla.bitableImport.preview.useMutation({
    onSuccess: (result) => {
      setPreview(result)
      setTab('preview')
      toast.success(`试跑完成：${result.sourceRowCount} 行，可入库 ${result.okCount} 条`)
    },
    onError: (error) => toast.error(error.message),
  })

  const runMutation = trpc.supplier.sla.bitableImport.runNow.useMutation({
    onSuccess: (result) => {
      toast.success(result.message ?? `同步完成：${result.status}`)
      if (result.preview) {
        setPreview(result.preview)
        setTab('preview')
      }
      void refetch()
      void refetchJobs()
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteMutation = trpc.supplier.sla.bitableImport.deleteConfig.useMutation({
    onSuccess: () => {
      toast.success('已删除')
      void refetch()
    },
    onError: (error) => toast.error(error.message),
  })

  const openCreate = () => {
    setEditing(null)
    setConfigDialogOpen(true)
  }

  const defaultSyncKind = syncKindFilter === 'all' ? undefined : syncKindFilter

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl min-w-[40vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconTable className="h-5 w-5" />
              飞书多维表格 · SLA 数据同步
            </DialogTitle>
            <DialogDescription>
              同步中台故障、内部使用与供应商产能合同；支持试跑预览与定时入库。
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="config">同步配置</TabsTrigger>
              <TabsTrigger value="preview" disabled={!preview}>
                试跑预览
              </TabsTrigger>
              <TabsTrigger value="history">作业历史</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-4 mt-4">
              <Tabs
                value={syncKindFilter}
                onValueChange={(v) => setSyncKindFilter(v as 'all' | SlaBitableSyncKind)}
              >
                <TabsList className="flex h-auto flex-wrap">
                  <TabsTrigger value="all">全部</TabsTrigger>
                  {SLA_BITABLE_SYNC_KINDS.map((kind) => (
                    <TabsTrigger key={kind} value={kind}>
                      {SLA_SYNC_KIND_LABELS[kind]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  按数据集分别配置多维表格；默认试跑后手动确认入库。
                </p>
                <Button size="sm" onClick={openCreate}>
                  新建同步配置
                </Button>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">加载中…</p>
              ) : filteredConfigs.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <IconTable className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">尚未配置该类型的多维表格同步</p>
                  <Button onClick={openCreate}>新建同步配置</Button>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>配置名称</TableHead>
                        <TableHead>数据集</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>自动入库</TableHead>
                        <TableHead>上次成功</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredConfigs.map((config) => (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">{config.name}</TableCell>
                          <TableCell>{SLA_SYNC_KIND_LABELS[config.syncKind]}</TableCell>
                          <TableCell>
                            <Badge variant={config.enabled ? 'default' : 'secondary'}>
                              {config.enabled ? '已启用' : '已禁用'}
                            </Badge>
                          </TableCell>
                          <TableCell>{config.autoCommit ? '是' : '否'}</TableCell>
                          <TableCell className="text-sm">{formatDt(config.lastSuccessAt)}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={previewMutation.isPending}
                              onClick={() => previewMutation.mutate({ configId: config.id })}
                            >
                              试跑
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={runMutation.isPending}
                              onClick={() => runMutation.mutate({ configId: config.id })}
                            >
                              同步
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(config)
                                setConfigDialogOpen(true)
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setJobConfigId(config.id)
                                setTab('history')
                              }}
                            >
                              历史
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                if (window.confirm(`确定删除配置「${config.name}」？`)) {
                                  deleteMutation.mutate({ id: config.id })
                                }
                              }}
                            >
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              {preview ? (
                <SlaBitablePreviewPanel
                  preview={preview}
                  onCommitted={() => {
                    setPreview(null)
                    setTab('config')
                    void refetch()
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">请先试跑同步</p>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => void refetchJobs()}>
                  <IconRefresh className="h-4 w-4 mr-1" />
                  刷新
                </Button>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>错误</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(jobRuns?.items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          暂无作业记录
                        </TableCell>
                      </TableRow>
                    ) : (
                      jobRuns?.items.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="text-sm">{formatDt(run.startedAt)}</TableCell>
                          <TableCell>{statusBadge(run.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                            {run.errorMessage ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <SlaBitableSyncConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        initial={editing}
        defaultSyncKind={defaultSyncKind}
        onSaved={() => void refetch()}
      />
    </>
  )
}
