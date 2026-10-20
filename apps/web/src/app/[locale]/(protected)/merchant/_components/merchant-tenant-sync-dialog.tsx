'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { validateBillingDateRange } from '@/lib/crm/tenant-billing-import-utils'
import { trpc } from '@/lib/trpc/client'
import type {
  MerchantTenantSyncAction,
  MerchantTenantSyncCommitItem,
  MerchantTenantSyncCommitResult,
  MerchantTenantSyncPreviewResult,
  MerchantTenantSyncPreviewRow,
} from '@/lib/types/merchant-tenant-sync'
import type {
  PlatformImportBillingBatchResult,
  PlatformImportCustomerAssignment,
} from '@/lib/types/platform-tenant-import'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
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
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group'
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

type Step = 'loading' | 'preview' | 'committing' | 'done'
type CommitPhase = 'tenants' | 'billing'

type RowAssignment = {
  platformTenantId: string
  customer: PlatformImportCustomerAssignment
}

const ACTION_LABEL: Record<MerchantTenantSyncAction, string> = {
  create: '新建',
  update: '更新',
  rebind: '待确认改绑',
  unchanged: '无变化',
  local_only: '仅本地',
}

const ACTION_BADGE: Record<
  MerchantTenantSyncAction,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  create: 'default',
  update: 'secondary',
  rebind: 'destructive',
  unchanged: 'outline',
  local_only: 'outline',
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

function defaultCreateCustomer(row: MerchantTenantSyncPreviewRow): PlatformImportCustomerAssignment & {
  mode: 'create'
} {
  return {
    mode: 'create',
    name: row.platformName || `租户-${row.platformTenantId}`,
    type: 'B',
  }
}

function buildInitialAssignments(preview: MerchantTenantSyncPreviewResult): RowAssignment[] {
  return preview.rows
    .filter((row) => row.action === 'create')
    .map((row) => ({
      platformTenantId: row.platformTenantId,
      customer: defaultCreateCustomer(row),
    }))
}

function CustomerSearchSelect({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (customerId: string) => void
  disabled?: boolean
}) {
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setOpen(false)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const { data: customersData, isFetching } = trpc.crm.customers.list.useQuery(
    { search: debouncedSearch || undefined, page: 1, pageSize: 50 },
    { enabled: !disabled },
  )
  const customers = customersData?.items ?? []

  return (
    <div className="space-y-2">
      <Input
        placeholder="搜索客户…"
        value={search}
        disabled={disabled}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value || undefined}
        onValueChange={(customerId) => {
          onChange(customerId)
          setOpen(false)
        }}
        disabled={disabled}
        key={debouncedSearch || '__all__'}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={isFetching ? '加载中…' : '选择客户'} />
        </SelectTrigger>
        <SelectContent position="popper">
          {customers.length === 0 ? (
            <SelectItem value="__empty__" disabled>
              {debouncedSearch ? '未找到匹配客户' : '输入关键词搜索客户'}
            </SelectItem>
          ) : (
            customers.slice(0, 50).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {`${c.name} (${c.type === 'B' ? '企业' : '个人'})`}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

export function MerchantTenantSyncDialog({
  open,
  onOpenChange,
  merchantId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  onSuccess: () => void
}) {
  const [step, setStep] = React.useState<Step>('loading')
  const [preview, setPreview] = React.useState<MerchantTenantSyncPreviewResult | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [assignments, setAssignments] = React.useState<RowAssignment[]>([])
  /** 已归属其他商户的租户：用户勾选后才改绑 */
  const [selectedRebindIds, setSelectedRebindIds] = React.useState<Set<string>>(new Set())
  const [confirmedNoCustomerUpdate, setConfirmedNoCustomerUpdate] = React.useState(false)
  const [importBillingData, setImportBillingData] = React.useState(false)
  const [billingStartDate, setBillingStartDate] = React.useState('')
  const [billingEndDate, setBillingEndDate] = React.useState('')
  const [commitPhase, setCommitPhase] = React.useState<CommitPhase>('tenants')
  const [billingProgress, setBillingProgress] = React.useState<{
    current: number
    total: number
    tenantName: string
  } | null>(null)
  const [commitResult, setCommitResult] = React.useState<MerchantTenantSyncCommitResult | null>(
    null,
  )

  const previewMutation = trpc.merchant.tenant.syncPreview.useMutation()
  const commitMutation = trpc.merchant.tenant.syncCommit.useMutation()
  const directBillingImportMutation = trpc.crm.tenants.directBillingImport.useMutation()

  const loading =
    step === 'loading' ||
    step === 'committing' ||
    previewMutation.isPending ||
    commitMutation.isPending ||
    directBillingImportMutation.isPending

  const reset = React.useCallback(() => {
    setStep('loading')
    setPreview(null)
    setFetchError(null)
    setAssignments([])
    setSelectedRebindIds(new Set())
    setConfirmedNoCustomerUpdate(false)
    setImportBillingData(false)
    setBillingStartDate('')
    setBillingEndDate('')
    setCommitPhase('tenants')
    setBillingProgress(null)
    setCommitResult(null)
  }, [])

  const loadPreview = React.useCallback(async () => {
    setStep('loading')
    setFetchError(null)
    setCommitResult(null)
    try {
      const result = await previewMutation.mutateAsync({ merchantId })
      setPreview(result)
      setAssignments(buildInitialAssignments(result))
      setSelectedRebindIds(new Set())
      setStep('preview')

      const { create, update, rebind, unchanged, localOnly } = result.summary
      if (result.platformTotal === 0 && localOnly === 0) {
        toast.info('平台未返回该商户下的关联租户')
      } else if (create === 0 && update === 0 && rebind === 0) {
        toast.info(
          `已对比 ${result.platformTotal} 条平台租户：无变化 ${unchanged}，仅本地 ${localOnly}`,
        )
      } else {
        toast.success(
          `拉取 ${result.platformTotal} 条：新建 ${create}、更新 ${update}、待确认改绑 ${rebind}、无变化 ${unchanged}`,
        )
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '拉取平台租户失败')
      setStep('preview')
      toast.error(e instanceof Error ? e.message : '拉取平台租户失败')
    }
  }, [merchantId, previewMutation])

  React.useEffect(() => {
    if (!open) return
    reset()
    void loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在弹窗打开时拉取
  }, [open, merchantId])

  const assignmentById = React.useMemo(() => {
    const map = new Map<string, RowAssignment>()
    assignments.forEach((a) => map.set(a.platformTenantId, a))
    return map
  }, [assignments])

  const createRows = React.useMemo(
    () => preview?.rows.filter((r) => r.action === 'create') ?? [],
    [preview],
  )

  const rebindRows = React.useMemo(
    () => preview?.rows.filter((r) => r.action === 'rebind') ?? [],
    [preview],
  )

  const canCommitRows = React.useMemo(
    () =>
      preview?.rows.filter(
        (r) =>
          r.action === 'create' ||
          r.action === 'update' ||
          (r.action === 'rebind' && selectedRebindIds.has(r.platformTenantId)),
      ) ?? [],
    [preview, selectedRebindIds],
  )

  const toggleRebind = (platformTenantId: string, checked: boolean) => {
    setSelectedRebindIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(platformTenantId)
      else next.delete(platformTenantId)
      return next
    })
  }

  const billingDateRangeError = React.useMemo(() => {
    if (!importBillingData) return null
    try {
      validateBillingDateRange(billingStartDate, billingEndDate)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : '账单日期范围无效'
    }
  }, [importBillingData, billingStartDate, billingEndDate])

  const validationError = React.useMemo(() => {
    if (step !== 'preview') return null
    if (canCommitRows.length === 0) {
      if (rebindRows.length > 0) {
        return '没有可写入的变更：已绑定其他商户的租户需勾选「确认改绑」后才会改绑'
      }
      return '没有可写入的变更'
    }
    if (billingDateRangeError) return billingDateRangeError
    for (const row of createRows) {
      const a = assignmentById.get(row.platformTenantId)
      if (!a) return `请为平台租户 ${row.platformTenantId} 配置客户关联`
      if (a.customer.mode === 'existing' && !a.customer.customerId) {
        return `请为平台租户 ${row.platformTenantId} 选择客户`
      }
      if (a.customer.mode === 'create' && !a.customer.name.trim()) {
        return `请为平台租户 ${row.platformTenantId} 填写客户名称`
      }
    }
    const hasNewCustomer = createRows.some(
      (r) => assignmentById.get(r.platformTenantId)?.customer.mode === 'create',
    )
    if (hasNewCustomer && !confirmedNoCustomerUpdate) {
      return '请勾选确认：不会修改已有客户的资料'
    }
    return null
  }, [
    step,
    canCommitRows,
    rebindRows,
    createRows,
    assignmentById,
    confirmedNoCustomerUpdate,
    billingDateRangeError,
  ])

  const updateAssignment = (
    platformTenantId: string,
    patch: Partial<PlatformImportCustomerAssignment>,
  ) => {
    setAssignments((prev) => {
      const idx = prev.findIndex((a) => a.platformTenantId === platformTenantId)
      if (idx < 0) return prev
      const next = [...prev]
      const current = next[idx]!
      next[idx] = {
        platformTenantId,
        customer: { ...current.customer, ...patch } as PlatformImportCustomerAssignment,
      }
      return next
    })
  }

  const setAssignmentMode = (platformTenantId: string, mode: 'create' | 'existing') => {
    const row = preview?.rows.find((r) => r.platformTenantId === platformTenantId)
    if (!row) return
    setAssignments((prev) => {
      const rest = prev.filter((a) => a.platformTenantId !== platformTenantId)
      if (mode === 'create') {
        return [...rest, { platformTenantId, customer: defaultCreateCustomer(row) }]
      }
      return [...rest, { platformTenantId, customer: { mode: 'existing', customerId: '' } }]
    })
  }

  const handleCommit = async () => {
    if (!preview) return
    if (validationError) {
      toast.error(validationError)
      return
    }

    const items: MerchantTenantSyncCommitItem[] = canCommitRows.map((row) => {
      if (row.action === 'create') {
        return {
          platformTenantId: row.platformTenantId,
          customer: assignmentById.get(row.platformTenantId)!.customer,
        }
      }
      return { platformTenantId: row.platformTenantId }
    })

    setStep('committing')
    setCommitPhase('tenants')
    setBillingProgress(null)

    try {
      const result = await commitMutation.mutateAsync({
        previewId: preview.previewId,
        items,
      })

      let billing: PlatformImportBillingBatchResult | undefined
      if (importBillingData && result.importedTenants.length > 0) {
        setCommitPhase('billing')
        const billingItems: PlatformImportBillingBatchResult['items'] = []
        for (let i = 0; i < result.importedTenants.length; i++) {
          const target = result.importedTenants[i]!
          setBillingProgress({
            current: i + 1,
            total: result.importedTenants.length,
            tenantName: target.tenantName,
          })
          try {
            const row = await directBillingImportMutation.mutateAsync({
              tenantId: target.tenantId,
              startDate: billingStartDate || undefined,
              endDate: billingEndDate || undefined,
            })
            billingItems.push(row)
          } catch (e) {
            billingItems.push({
              platformTenantId: target.platformTenantId,
              tenantName: target.tenantName,
              success: false,
              error: e instanceof Error ? e.message : '账单导入失败',
            })
          }
        }
        billing = {
          items: billingItems,
          successCount: billingItems.filter((item) => item.success).length,
          failedCount: billingItems.filter((item) => !item.success).length,
        }
      }

      const finalResult: MerchantTenantSyncCommitResult = { ...result, billing }
      setCommitResult(finalResult)
      setStep('done')

      const fail = result.errors.length
      const billingFail = billing?.failedCount ?? 0
      if (fail > 0 || billingFail > 0) {
        toast.warning(
          `同步完成：新建 ${result.createdTenants}、更新 ${result.updatedTenants}、改绑 ${result.reboundTenants}${billing ? `；账单 ${billing.successCount}/${billing.items.length} 成功` : ''}`,
        )
      } else {
        toast.success(
          `同步完成：新建 ${result.createdTenants}、更新 ${result.updatedTenants}、改绑 ${result.reboundTenants}${billing ? `；账单已同步 ${billing.successCount} 个租户` : ''}`,
        )
      }
    } catch (e) {
      setStep('preview')
      toast.error(e instanceof Error ? e.message : '同步失败')
    } finally {
      setCommitPhase('tenants')
      setBillingProgress(null)
    }
  }

  const handleClose = (next: boolean) => {
    if (!next && step === 'done') onSuccess()
    onOpenChange(next)
  }

  const canCommit = canCommitRows.length > 0 && !validationError

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl min-w-[50vw] flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? '同步完成' : '同步平台租户'}
          </DialogTitle>
          <DialogDescription>
            {step === 'done'
              ? '同步结果如下，关闭后将刷新关联租户列表。'
              : '从平台拉取该商户关联租户，与本地比对后确认写入；已绑定其他商户的租户需勾选后才会改绑。可选同步指定日期账单。'}
          </DialogDescription>
        </DialogHeader>

        {fetchError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{fetchError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadPreview()}
                disabled={loading}
              >
                重试
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {step === 'committing' ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            {commitPhase === 'billing' && billingProgress
              ? `正在同步账单 ${billingProgress.current}/${billingProgress.total}：${billingProgress.tenantName}`
              : '正在写入租户…'}
          </div>
        ) : null}

        {step === 'done' && commitResult ? (
          <div className="space-y-3 overflow-auto">
            <div className="grid grid-cols-4 gap-3">
              <Stat label="新建" value={commitResult.createdTenants} />
              <Stat label="更新" value={commitResult.updatedTenants} />
              <Stat label="改绑" value={commitResult.reboundTenants} />
              <Stat label="失败" value={commitResult.errors.length} />
            </div>
            {commitResult.billing ? (
              <p className="text-sm text-muted-foreground">
                账单同步：成功 {commitResult.billing.successCount} / 失败{' '}
                {commitResult.billing.failedCount}
              </p>
            ) : null}
            {commitResult.errors.length > 0 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {commitResult.errors
                    .slice(0, 5)
                    .map((e) => `${e.platformTenantId}: ${e.message}`)
                    .join('；')}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {step === 'preview' && preview ? (
          <>
            <div className="grid grid-cols-5 gap-3">
              <Stat label="平台总数" value={preview.platformTotal} />
              <Stat label="新建" value={preview.summary.create} />
              <Stat label="更新" value={preview.summary.update} />
              <Stat label="待确认改绑" value={preview.summary.rebind} />
              <Stat label="仅本地" value={preview.summary.localOnly} />
            </div>

            {rebindRows.length > 0 ? (
              <Alert>
                <AlertDescription>
                  有 {rebindRows.length}{' '}
                  个租户已绑定其他商户，默认不会改绑。请在对应行勾选「确认改绑」后再同步；未勾选的将跳过。
                  {selectedRebindIds.size > 0
                    ? ` 已勾选 ${selectedRebindIds.size} 个。`
                    : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">平台 ID</TableHead>
                    <TableHead>平台名称</TableHead>
                    <TableHead>本地 / 客户</TableHead>
                    <TableHead className="w-[80px]">操作</TableHead>
                    <TableHead>变更 / 提示</TableHead>
                    <TableHead className="min-w-[220px]">客户关联 / 改绑</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    preview.rows.map((row) => {
                      const assignment = assignmentById.get(row.platformTenantId)
                      return (
                        <TableRow key={row.platformTenantId}>
                          <TableCell className="font-mono tabular-nums">
                            {row.platformTenantId}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{row.platformName}</div>
                            <div className="text-xs text-muted-foreground">
                              余额 ¥{row.coin.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.localName ? (
                              <>
                                <div>{row.localName}</div>
                                <div className="text-xs">{row.localCustomerName ?? '—'}</div>
                                {row.action === 'rebind' ? (
                                  <div className="text-xs text-amber-600">
                                    当前商户：{row.localMerchantName}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ACTION_BADGE[row.action]}>
                              {ACTION_LABEL[row.action]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                            {row.changes.length > 0 ? row.changes.join('、') : '—'}
                            {row.warnings.length > 0 ? (
                              <span className="mt-0.5 block text-amber-600">
                                {row.warnings.join('；')}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {row.action === 'create' && assignment ? (
                              <div className="space-y-2">
                                <RadioGroup
                                  value={assignment.customer.mode}
                                  onValueChange={(v) =>
                                    setAssignmentMode(
                                      row.platformTenantId,
                                      v as 'create' | 'existing',
                                    )
                                  }
                                  className="flex gap-3"
                                  disabled={loading}
                                >
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <RadioGroupItem value="create" />
                                    新建客户
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <RadioGroupItem value="existing" />
                                    已有客户
                                  </label>
                                </RadioGroup>
                                {assignment.customer.mode === 'create' ? (
                                  <Input
                                    className="h-8 text-sm"
                                    value={assignment.customer.name}
                                    disabled={loading}
                                    onChange={(e) =>
                                      updateAssignment(row.platformTenantId, {
                                        name: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  <CustomerSearchSelect
                                    value={assignment.customer.customerId}
                                    disabled={loading}
                                    onChange={(customerId) =>
                                      updateAssignment(row.platformTenantId, { customerId })
                                    }
                                  />
                                )}
                              </div>
                            ) : row.action === 'rebind' ? (
                              <label className="flex cursor-pointer items-start gap-2 text-xs">
                                <Checkbox
                                  checked={selectedRebindIds.has(row.platformTenantId)}
                                  disabled={loading}
                                  onCheckedChange={(v) =>
                                    toggleRebind(row.platformTenantId, v === true)
                                  }
                                />
                                <span>
                                  确认改绑到当前商户
                                  {row.localMerchantName
                                    ? `（离开「${row.localMerchantName}」）`
                                    : null}
                                </span>
                              </label>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={importBillingData}
                  disabled={loading}
                  onCheckedChange={(v) => {
                    const checked = v === true
                    setImportBillingData(checked)
                    if (!checked) {
                      setBillingStartDate('')
                      setBillingEndDate('')
                    }
                  }}
                />
                <span>同时同步账单（月账单、日账单、充值、算力券等）</span>
              </label>
              {importBillingData ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="merchant-tenant-billing-start">开始日期（可选）</Label>
                    <Input
                      id="merchant-tenant-billing-start"
                      type="date"
                      value={billingStartDate}
                      disabled={loading}
                      onChange={(e) => setBillingStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="merchant-tenant-billing-end">结束日期（可选）</Label>
                    <Input
                      id="merchant-tenant-billing-end"
                      type="date"
                      value={billingEndDate}
                      disabled={loading}
                      onChange={(e) => setBillingEndDate(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              {billingDateRangeError ? (
                <p className="text-xs text-destructive">{billingDateRangeError}</p>
              ) : null}
            </div>

            {createRows.some(
              (r) => assignmentById.get(r.platformTenantId)?.customer.mode === 'create',
            ) ? (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={confirmedNoCustomerUpdate}
                  onCheckedChange={(v) => setConfirmedNoCustomerUpdate(v === true)}
                  disabled={loading}
                />
                <span>我已确认：不会修改已有客户的资料（仅新建客户或关联已有客户）</span>
              </label>
            ) : null}
          </>
        ) : null}

        {step === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            正在拉取平台租户并比对本地数据…
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={step === 'committing'}>
            {step === 'done' ? '关闭' : '取消'}
          </Button>
          {step === 'preview' ? (
            <>
              <Button variant="outline" onClick={() => void loadPreview()} disabled={loading}>
                重新拉取
              </Button>
              <Button onClick={() => void handleCommit()} disabled={loading || !canCommit}>
                确认同步
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
