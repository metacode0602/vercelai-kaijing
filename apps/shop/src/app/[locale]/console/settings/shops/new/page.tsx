'use client'

import * as React from 'react'
import { useLocale } from 'next-intl'
import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
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
import { Spinner } from '@workspace/ui/components/spinner'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

const PLATFORMS = [
  { value: 'daraz', label: 'Daraz' },
  { value: 'lazada', label: 'Lazada' },
]

const REGIONS_BY_PLATFORM: Record<
  string,
  Array<{ value: string; label: string; currency: string }>
> = {
  daraz: [
    { value: 'LK', label: '斯里兰卡（LK）', currency: 'LKR' },
    { value: 'PK', label: '巴基斯坦（PK）', currency: 'PKR' },
    { value: 'BD', label: '孟加拉国（BD）', currency: 'BDT' },
    { value: 'NP', label: '尼泊尔（NP）', currency: 'NPR' },
    { value: 'MM', label: '缅甸（MM）', currency: 'MMK' },
  ],
  lazada: [
    { value: 'MY', label: '马来西亚（MY）', currency: 'MYR' },
    { value: 'PH', label: '菲律宾（PH）', currency: 'PHP' },
    { value: 'TH', label: '泰国（TH）', currency: 'THB' },
    { value: 'SG', label: '新加坡（SG）', currency: 'SGD' },
    { value: 'VN', label: '越南（VN）', currency: 'VND' },
    { value: 'ID', label: '印度尼西亚（ID）', currency: 'IDR' },
  ],
}

const FULFILLMENT_MODES = ['自营仓发货', '平台仓', '混合']

export default function NewShopPage() {
  const locale = useLocale()
  const stateQuery = trpc.onboarding.getState.useQuery()
  const marketplaceAppsQuery = trpc.marketplaceApps.list.useQuery({ page: 1, pageSize: 100 })
  const [name, setName] = React.useState('')
  const [platform, setPlatform] = React.useState('daraz')
  const [region, setRegion] = React.useState('LK')
  const [sellerId, setSellerId] = React.useState('')
  const [shopGroup, setShopGroup] = React.useState('Daraz')
  const [fulfillmentMode, setFulfillmentMode] = React.useState('自营仓发货')
  const [error, setError] = React.useState('')

  const regions = REGIONS_BY_PLATFORM[platform] ?? []
  const currency = regions.find((item) => item.value === region)?.currency ?? 'USD'
  const hasMarketplaceApp =
    marketplaceAppsQuery.data?.items.some(
      (item) => item.platform === platform && (item.region === region || item.region === ''),
    ) ?? false

  const beginAuthorization = trpc.shops.beginAuthorization.useMutation({
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  const createDraft = trpc.shops.createDraft.useMutation({
    onSuccess: (shop) => {
      if (!shop) {
        setError('店铺创建失败')
        return
      }
      beginAuthorization.mutate({ id: shop.id, mode: 'bind', locale })
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  const busy = createDraft.isPending || beginAuthorization.isPending

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (name.trim().length < 2) {
      setError('请输入店铺名称')
      return
    }
    createDraft.mutate({
      name: name.trim(),
      platform: platform as 'daraz' | 'lazada',
      region,
      currency,
      sellerId: sellerId.trim() || undefined,
      shopGroup: shopGroup.trim() || undefined,
      fulfillmentMode,
    })
  }

  const status = stateQuery.data?.status
  const canBind = stateQuery.data?.bindingAllowed ?? false

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          店铺连接
        </p>
        <h1 className="mt-1 text-2xl font-semibold">新增店铺</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          先创建店铺草稿，随后跳转平台 OAuth 完成真实授权。
        </p>
      </div>

      {!stateQuery.isLoading && canBind && !marketplaceAppsQuery.isLoading && !hasMarketplaceApp ? (
        <Alert>
          <AlertTitle>当前平台与站点尚未配置应用</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              需要先在「设置 → 平台应用配置」填写 {platform.toUpperCase()} / {region} 的 App
              Key 与 App Secret，否则无法跳转平台授权。
            </p>
            <Button asChild variant="outline" size="sm">
              <LocaleLink href="/console/settings/marketplace-apps">前往配置</LocaleLink>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!stateQuery.isLoading && !canBind ? (
        <Card>
          <CardHeader>
            <CardTitle>需要先完成入驻</CardTitle>
            <CardDescription>
              当前入驻状态为「{status ?? '未开始'}」。完成资料提交后才可新增店铺。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <LocaleLink href="/onboarding">前往入驻</LocaleLink>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>店铺信息</CardTitle>
            <CardDescription>平台店铺 ID 将在 OAuth 回调后自动写入。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>平台</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    value={platform}
                    onChange={(event) => {
                      const value = event.target.value
                      setPlatform(value)
                      setShopGroup(value === 'daraz' ? 'Daraz' : 'Lazada 五国')
                      const nextRegions = REGIONS_BY_PLATFORM[value] ?? []
                      if (!nextRegions.some((item) => item.value === region)) {
                        setRegion(nextRegions[0]?.value ?? '')
                      }
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
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  >
                    {regions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>店铺名称</Label>
                  <Input
                    value={name}
                    placeholder="例如：Lanka Home Store"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>卖家 ID（可选）</Label>
                  <Input
                    value={sellerId}
                    placeholder="平台卖家账号 ID"
                    onChange={(event) => setSellerId(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>店铺分组</Label>
                  <Input
                    value={shopGroup}
                    onChange={(event) => setShopGroup(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>履约模式</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    value={fulfillmentMode}
                    onChange={(event) => setFulfillmentMode(event.target.value)}
                  >
                    {FULFILLMENT_MODES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>币种</Label>
                  <Input value={currency} readOnly />
                </div>
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button asChild variant="ghost">
                  <LocaleLink href="/console/settings/shops">返回店铺列表</LocaleLink>
                </Button>
                <Button type="submit" disabled={busy || !canBind}>
                  {busy ? <Spinner className="size-4" /> : null}
                  创建并去授权
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
