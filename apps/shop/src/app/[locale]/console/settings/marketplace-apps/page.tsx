'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { MarketplaceAppSetupGuide } from '@/components/settings/marketplace-app-setup-guide'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

type Platform = 'daraz' | 'lazada' | 'tiktok_shop'

type AppRow = {
  id: string
  platform: string
  platformLabel: string
  region: string
  regionLabel: string
  appKey: string
  hasSecret: boolean
  callbackKey: string
  callbackUrl: string
  status: string
  lastVerifiedAt: string | null
  lastError: string | null
  updatedAt: string
}

const PLATFORMS: Array<{ value: Platform; label: string }> = [
  { value: 'daraz', label: 'Daraz' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'tiktok_shop', label: 'TikTok Shop' },
]

const REGIONS_BY_PLATFORM: Record<Platform, Array<{ value: string; label: string }>> = {
  daraz: [
    { value: '', label: '全部站点（通用）' },
    { value: 'LK', label: '斯里兰卡（LK）' },
    { value: 'PK', label: '巴基斯坦（PK）' },
    { value: 'BD', label: '孟加拉国（BD）' },
    { value: 'NP', label: '尼泊尔（NP）' },
    { value: 'MM', label: '缅甸（MM）' },
  ],
  lazada: [
    { value: '', label: '全部站点（通用）' },
    { value: 'MY', label: '马来西亚（MY）' },
    { value: 'PH', label: '菲律宾（PH）' },
    { value: 'TH', label: '泰国（TH）' },
    { value: 'SG', label: '新加坡（SG）' },
    { value: 'VN', label: '越南（VN）' },
    { value: 'ID', label: '印度尼西亚（ID）' },
  ],
  tiktok_shop: [
    { value: '', label: '全部站点（通用）' },
    { value: 'GLOBAL', label: '全球（GLOBAL）' },
    { value: 'MY', label: '马来西亚（MY）' },
    { value: 'PH', label: '菲律宾（PH）' },
    { value: 'TH', label: '泰国（TH）' },
    { value: 'SG', label: '新加坡（SG）' },
    { value: 'VN', label: '越南（VN）' },
    { value: 'ID', label: '印度尼西亚（ID）' },
    { value: 'US', label: '美国（US）' },
    { value: 'GB', label: '英国（GB）' },
  ],
}

const EMPTY_FORM = {
  platform: 'daraz' as Platform,
  region: '',
  appKey: '',
  appSecret: '',
  callbackKey: '',
}

function stamp(value: string | null) {
  if (!value) return '—'
  return value.slice(0, 16).replace('T', ' ')
}

function statusLabel(status: string) {
  if (status === 'active') return '启用'
  if (status === 'disabled') return '已禁用'
  return status
}

export default function MarketplaceAppsSettingsPage() {
  const utils = trpc.useUtils()
  const stateQuery = trpc.onboarding.getState.useQuery()
  const [page, setPage] = React.useState(1)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [detailRow, setDetailRow] = React.useState<AppRow | null>(null)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [copiedCallback, setCopiedCallback] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null,
  )
  const searchParams = useSearchParams()
  const missingApp = React.useMemo(() => {
    if (searchParams.get('reason') !== 'missing-app') return null
    const shopId = searchParams.get('shopId') ?? ''
    return {
      platform: searchParams.get('platform') ?? '',
      shopId: /^[a-zA-Z0-9_-]+$/.test(shopId) ? shopId : '',
    }
  }, [searchParams])

  const listQuery = trpc.marketplaceApps.list.useQuery({ page, pageSize: 20 })
  const rows = (listQuery.data?.items ?? []) as AppRow[]
  const total = listQuery.data?.total ?? 0
  const callbackBaseUrl = listQuery.data?.callbackBaseUrl ?? ''
  const canEdit = stateQuery.data?.organizationRole === 'tenant_owner'

  const regions = REGIONS_BY_PLATFORM[form.platform]
  const missingPlatformLabel = missingApp
    ? (PLATFORMS.find((item) => item.value === missingApp.platform)?.label ??
      missingApp.platform)
    : ''

  const refresh = React.useCallback(async () => {
    await utils.marketplaceApps.list.invalidate()
  }, [utils])

  const createMutation = trpc.marketplaceApps.create.useMutation({
    onSuccess: async () => {
      setNotice({ tone: 'ok', text: '平台应用配置已保存' })
      setFormOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      setFormError(null)
      await refresh()
    },
    onError: (error) => setFormError(error.message),
  })

  const updateMutation = trpc.marketplaceApps.update.useMutation({
    onSuccess: async () => {
      setNotice({ tone: 'ok', text: '平台应用配置已更新' })
      setFormOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      setFormError(null)
      await refresh()
    },
    onError: (error) => setFormError(error.message),
  })

  const setStatusMutation = trpc.marketplaceApps.setStatus.useMutation({
    onSuccess: async (row) => {
      setNotice({
        tone: 'ok',
        text: row.status === 'active' ? '平台应用配置已启用' : '平台应用配置已禁用',
      })
      if (detailRow?.id === row.id) {
        setDetailRow(row as AppRow)
      }
      await refresh()
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  })

  const busy =
    createMutation.isPending || updateMutation.isPending || setStatusMutation.isPending

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(row: AppRow) {
    setEditingId(row.id)
    setForm({
      platform: row.platform as Platform,
      region: row.region,
      appKey: row.appKey,
      appSecret: '',
      callbackKey: row.callbackKey,
    })
    setFormError(null)
    setFormOpen(true)
  }

  function submitForm(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!form.appKey.trim()) {
      setFormError('请填写 App Key')
      return
    }
    if (!editingId && !form.appSecret.trim()) {
      setFormError('请填写 App Secret')
      return
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        platform: form.platform,
        region: form.region,
        appKey: form.appKey.trim(),
        appSecret: form.appSecret.trim() || undefined,
        callbackKey: form.callbackKey.trim() || null,
      })
      return
    }
    createMutation.mutate({
      platform: form.platform,
      region: form.region,
      appKey: form.appKey.trim(),
      appSecret: form.appSecret.trim(),
      callbackKey: form.callbackKey.trim() || undefined,
    })
  }

  function toggleStatus(row: AppRow) {
    const next = row.status === 'active' ? 'disabled' : 'active'
    const action = next === 'disabled' ? '禁用' : '启用'
    if (
      !window.confirm(
        `确认${action} ${row.platformLabel} / ${row.regionLabel} 的应用配置？${
          next === 'disabled' ? '禁用后该配置将无法用于授权与同步。' : ''
        }`,
      )
    ) {
      return
    }
    setStatusMutation.mutate({ id: row.id, status: next })
  }

  async function copyCallback(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedCallback(true)
      window.setTimeout(() => setCopiedCallback(false), 1800)
    } catch {
      setCopiedCallback(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            设置 / 平台应用配置
          </p>
          <h1 className="mt-1 text-2xl font-semibold">平台应用配置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            为当前组织配置 Marketplace 开放平台应用；授权与同步都使用这里的 App Key / App Secret。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setHelpOpen(true)}>
            帮助
          </Button>
          {canEdit ? (
            <Button type="button" onClick={openCreate}>
              添加应用
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <LocaleLink href="/console/settings/shops">返回店铺连接</LocaleLink>
          </Button>
        </div>
      </div>

      {!stateQuery.isLoading && !canEdit ? (
        <Alert>
          <AlertTitle>只读权限</AlertTitle>
          <AlertDescription>
            仅租户所有者可以新增、修改或禁用平台应用配置。你仍可以查看详情并使用授权功能。
          </AlertDescription>
        </Alert>
      ) : null}

      {missingApp ? (
        <Alert variant="destructive">
          <AlertTitle>请先配置平台应用</AlertTitle>
          <AlertDescription>
            当前组织尚未配置 {missingPlatformLabel || '该平台'} 的 App Key / App Secret。
            点击「添加应用」保存后，返回店铺重新点击「去平台授权」。
            {missingApp.shopId ? (
              <LocaleLink
                href={`/console/settings/shops/${missingApp.shopId}`}
                className="ml-1 font-medium underline underline-offset-2"
              >
                返回店铺
              </LocaleLink>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert variant={notice.tone === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{notice.tone === 'error' ? '操作失败' : '操作成功'}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>已配置平台应用</CardTitle>
            <CardDescription>
              共 {total} 条配置。App Secret 永远不会返回明文；禁用后不可用于授权。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台</TableHead>
                  <TableHead>站点</TableHead>
                  <TableHead>App Key</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>回调地址</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近验证</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-20 text-center text-sm text-muted-foreground"
                    >
                      {listQuery.isLoading
                        ? '加载中…'
                        : canEdit
                          ? '暂无配置。点击「添加应用」新增当前平台与站点的应用。'
                          : '暂无配置。'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.platformLabel}</TableCell>
                      <TableCell>{row.regionLabel}</TableCell>
                      <TableCell
                        className="max-w-52 truncate font-mono text-xs"
                        title={row.appKey}
                      >
                        {row.appKey}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {row.hasSecret ? '已配置' : '未配置'}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-72 truncate font-mono text-xs"
                        title={row.callbackUrl}
                      >
                        {row.callbackUrl}
                      </TableCell>
                      <TableCell>
                        {row.lastError ? (
                          <Badge variant="destructive" title={row.lastError}>
                            异常
                          </Badge>
                        ) : (
                          <Badge
                            variant={row.status === 'active' ? 'secondary' : 'outline'}
                          >
                            {statusLabel(row.status)}
                          </Badge>
                        )}
                        {row.lastError ? (
                          <p
                            className="mt-1 max-w-48 truncate text-xs text-destructive"
                            title={row.lastError}
                          >
                            {row.lastError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {stamp(row.lastVerifiedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailRow(row)}
                          >
                            详情
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canEdit || busy}
                            onClick={() => openEdit(row)}
                          >
                            修改
                          </Button>
                          <Button
                            type="button"
                            variant={row.status === 'active' ? 'destructive' : 'secondary'}
                            size="sm"
                            disabled={!canEdit || busy}
                            onClick={() => toggleStatus(row)}
                          >
                            {row.status === 'active' ? '禁用' : '启用'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">第 {page} 页 · 每页 20 条</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || listQuery.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page * 20 >= total || listQuery.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditingId(null)
            setForm(EMPTY_FORM)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <form className="grid gap-4" onSubmit={submitForm}>
            <DialogHeader>
              <DialogTitle>{editingId ? '修改应用' : '添加应用'}</DialogTitle>
              <DialogDescription>
                同一平台同一站点只能有一份配置。默认使用「全部站点（通用）」；只有平台要求按站点独立应用时才选择具体站点覆盖。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>平台</Label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={form.platform}
                  disabled={busy}
                  onChange={(event) => {
                    const platform = event.target.value as Platform
                    const nextRegions = REGIONS_BY_PLATFORM[platform]
                    setForm((current) => ({
                      ...current,
                      platform,
                      region: nextRegions.some((item) => item.value === current.region)
                        ? current.region
                        : nextRegions[0]?.value ?? '',
                    }))
                  }}
                >
                  {PLATFORMS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>站点</Label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={form.region}
                  disabled={busy}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, region: event.target.value }))
                  }
                >
                  {regions.map((item) => (
                    <option key={item.value || 'all'} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>App Key</Label>
                <Input
                  value={form.appKey}
                  disabled={busy}
                  placeholder="平台开放后台的 App Key"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, appKey: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>App Secret</Label>
                <Input
                  type="password"
                  value={form.appSecret}
                  disabled={busy}
                  placeholder={editingId ? '留空表示不修改' : '平台开放后台的 App Secret'}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, appSecret: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>独立回调标识（可选）</Label>
                <Input
                  value={form.callbackKey}
                  disabled={busy}
                  placeholder="例如 lk-app-01；留空使用默认回调"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, callbackKey: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  只能包含字母、数字、下划线和短横线。填写后平台回调地址必须使用对应的独立路径。
                </p>
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setFormOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={busy}>
                {editingId ? '保存修改' : '保存配置'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailRow)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailRow(null)
            setCopiedCallback(false)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          {detailRow ? (
            <>
              <DialogHeader>
                <DialogTitle>应用详情</DialogTitle>
                <DialogDescription>
                  {detailRow.platformLabel} · {detailRow.regionLabel}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">平台</p>
                  <p className="font-medium">{detailRow.platformLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">站点</p>
                  <p className="font-medium">{detailRow.regionLabel}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">App Key</p>
                  <p className="break-all font-mono text-xs">{detailRow.appKey}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Secret</p>
                  <p className="font-medium">
                    {detailRow.hasSecret ? '已配置（不可查看）' : '未配置'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">状态</p>
                  <p className="font-medium">{statusLabel(detailRow.status)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">独立回调标识</p>
                  <p className="font-mono text-xs">{detailRow.callbackKey || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">最近验证</p>
                  <p className="font-medium">{stamp(detailRow.lastVerifiedAt)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">回调地址</p>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="break-all font-mono text-xs">{detailRow.callbackUrl}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyCallback(detailRow.callbackUrl)}
                    >
                      {copiedCallback ? '已复制' : '复制'}
                    </Button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">最近错误</p>
                  <p className="break-all text-destructive">
                    {detailRow.lastError || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">更新时间</p>
                  <p className="font-medium">{stamp(detailRow.updatedAt)}</p>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setDetailRow(null)
                          openEdit(detailRow)
                        }}
                      >
                        修改
                      </Button>
                      <Button
                        type="button"
                        variant={
                          detailRow.status === 'active' ? 'destructive' : 'secondary'
                        }
                        disabled={busy}
                        onClick={() => toggleStatus(detailRow)}
                      >
                        {detailRow.status === 'active' ? '禁用' : '启用'}
                      </Button>
                    </>
                  ) : null}
                </div>
                <Button type="button" variant="outline" onClick={() => setDetailRow(null)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>如何获取平台应用凭据</DialogTitle>
            <DialogDescription>
              每个租户使用自己的开放平台应用。App Secret 只保存在服务端，保存后不可再次查看。
            </DialogDescription>
          </DialogHeader>
          <MarketplaceAppSetupGuide baseUrl={callbackBaseUrl} embedded />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHelpOpen(false)}>
              关闭
            </Button>
            {canEdit ? (
              <Button
                type="button"
                onClick={() => {
                  setHelpOpen(false)
                  openCreate()
                }}
              >
                去添加应用
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
