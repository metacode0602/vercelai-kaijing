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

export default function MarketplaceAppsSettingsPage() {
  const utils = trpc.useUtils()
  const stateQuery = trpc.onboarding.getState.useQuery()
  const [page, setPage] = React.useState(1)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [editingId, setEditingId] = React.useState<string | null>(null)
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
  const rows = listQuery.data?.items ?? []
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
      setForm(EMPTY_FORM)
      await refresh()
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  })

  const updateMutation = trpc.marketplaceApps.update.useMutation({
    onSuccess: async () => {
      setNotice({ tone: 'ok', text: '平台应用配置已更新' })
      setEditingId(null)
      setForm(EMPTY_FORM)
      await refresh()
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  })

  const removeMutation = trpc.marketplaceApps.remove.useMutation({
    onSuccess: async () => {
      setNotice({ tone: 'ok', text: '平台应用配置已删除' })
      if (editingId) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
      await refresh()
    },
    onError: (error) => setNotice({ tone: 'error', text: error.message }),
  })

  const busy =
    createMutation.isPending || updateMutation.isPending || removeMutation.isPending

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setNotice(null)
    if (!form.appKey.trim()) {
      setNotice({ tone: 'error', text: '请填写 App Key' })
      return
    }
    if (!editingId && !form.appSecret.trim()) {
      setNotice({ tone: 'error', text: '请填写 App Secret' })
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

  function startEdit(row: {
    id: string
    platform: string
    region: string
    appKey: string
    callbackKey: string
  }) {
    setEditingId(row.id)
    setForm({
      platform: row.platform as Platform,
      region: row.region,
      appKey: row.appKey,
      appSecret: '',
      callbackKey: row.callbackKey,
    })
    setNotice(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setNotice(null)
  }

  function remove(row: { id: string; platformLabel: string; regionLabel: string }) {
    if (
      !window.confirm(
        `确认删除 ${row.platformLabel} / ${row.regionLabel} 的应用配置？删除后相关店铺需重新配置才能授权。`,
      )
    ) {
      return
    }
    removeMutation.mutate({ id: row.id })
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
        <Button variant="outline" asChild>
          <LocaleLink href="/console/settings/shops">返回店铺连接</LocaleLink>
        </Button>
      </div>

      {!stateQuery.isLoading && !canEdit ? (
        <Alert>
          <AlertTitle>只读权限</AlertTitle>
          <AlertDescription>
            仅租户所有者可以新增、编辑或删除平台应用配置。你仍可以查看配置并使用授权功能。
          </AlertDescription>
        </Alert>
      ) : null}

      {missingApp ? (
        <Alert variant="destructive">
          <AlertTitle>请先配置平台应用</AlertTitle>
          <AlertDescription>
            当前组织尚未配置 {missingPlatformLabel || '该平台'} 的 App Key / App Secret。
            保存配置后，返回店铺重新点击「去平台授权」。
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

      <MarketplaceAppSetupGuide baseUrl={callbackBaseUrl} />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? '编辑配置' : '新增配置'}</CardTitle>
          <CardDescription>
            同一平台同一站点只能有一份配置。默认使用「全部站点（通用）」；只有平台要求按站点独立应用时才选择具体站点覆盖。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>平台</Label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={form.platform}
                  disabled={!canEdit || busy}
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
                  disabled={!canEdit || busy}
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
                  disabled={!canEdit || busy}
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
                  disabled={!canEdit || busy}
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
                  disabled={!canEdit || busy}
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

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!canEdit || busy}>
                {editingId ? '保存修改' : '保存配置'}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEdit}
                  disabled={busy}
                >
                  取消编辑
                </Button>
              ) : null}
              {!canEdit ? (
                <span className="text-xs text-muted-foreground">只读角色无法保存。</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已配置平台应用</CardTitle>
          <CardDescription>
            共 {total} 条配置。App Secret 永远不会返回明文。
          </CardDescription>
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
                        : '暂无配置。请先新增当前平台与站点的应用。'}
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
                        <Badge variant="secondary">已配置</Badge>
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
                          <Badge variant="secondary">
                            {row.status === 'active' ? '启用' : row.status}
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
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canEdit || busy}
                            onClick={() => startEdit(row)}
                          >
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={!canEdit || busy}
                            onClick={() => remove(row)}
                          >
                            删除
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
    </div>
  )
}
