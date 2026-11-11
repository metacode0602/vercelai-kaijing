'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Label } from '@workspace/ui/components/label'

const TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Colombo',
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'UTC',
]

const CURRENCIES = ['USD', 'CNY', 'LKR', 'MYR', 'SGD', 'THB', 'PHP', 'IDR', 'VND', 'EUR']

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: '舒适' },
  { value: 'compact', label: '紧凑' },
]

export default function SettingsPreferencesPage() {
  const utils = trpc.useUtils()
  const prefsQuery = trpc.organization.getPreferences.useQuery()
  const shopsQuery = trpc.shops.list.useQuery({ page: 1, pageSize: 100 })
  const [draft, setDraft] = React.useState<{
    defaultShopId: string
    timezone: string
    displayCurrency: string
    tableDensity: string
  } | null>(null)
  const [notice, setNotice] = React.useState('')
  const [noticeError, setNoticeError] = React.useState(false)
  const defaultShopId = draft?.defaultShopId ?? prefsQuery.data?.defaultShopId ?? ''
  const timezone = draft?.timezone ?? prefsQuery.data?.timezone ?? 'Asia/Shanghai'
  const displayCurrency = draft?.displayCurrency ?? prefsQuery.data?.displayCurrency ?? 'USD'
  const tableDensity = draft?.tableDensity ?? prefsQuery.data?.tableDensity ?? 'comfortable'

  function patchDraft(partial: Partial<NonNullable<typeof draft>>) {
    setDraft({
      defaultShopId,
      timezone,
      displayCurrency,
      tableDensity,
      ...partial,
    })
  }

  const saveMutation = trpc.organization.updatePreferences.useMutation({
    onSuccess: async (data) => {
      await utils.organization.getPreferences.invalidate()
      setDraft(null)
      setNoticeError(false)
      setNotice(
        `组织偏好已保存${data.defaultShopName ? `（默认店铺：${data.defaultShopName}）` : '（未指定默认店铺）'}。`,
      )
    },
    onError: (error) => {
      setNoticeError(true)
      setNotice(error.message)
    },
  })

  const shops = shopsQuery.data?.items ?? []
  const timezoneOptions = React.useMemo(() => {
    const set = new Set(TIMEZONES)
    if (timezone) set.add(timezone)
    return [...set]
  }, [timezone])
  const currencyOptions = React.useMemo(() => {
    const set = new Set(CURRENCIES)
    if (displayCurrency) set.add(displayCurrency)
    return [...set]
  }, [displayCurrency])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">偏好</h2>
        <p className="text-sm text-muted-foreground">默认店铺、时区、展示币种与表格密度，保存为当前组织配置。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">运营默认值</CardTitle>
          <CardDescription>默认店铺只能从本组织已有店铺中选择，不会使用演示店铺。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {prefsQuery.isLoading || shopsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">加载中…</p>
          ) : null}
          {prefsQuery.isError ? (
            <p className="text-sm text-destructive sm:col-span-2">{prefsQuery.error.message}</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="shop">默认店铺</Label>
            <select
              id="shop"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={defaultShopId}
              onChange={(event) => patchDraft({ defaultShopId: event.target.value })}
            >
              <option value="">{shops.length === 0 ? '暂无店铺，请先在店铺设置中添加' : '不指定'}</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name} · {shop.platformLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tz">时区</Label>
            <select
              id="tz"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={timezone}
              onChange={(event) => patchDraft({ timezone: event.target.value })}
            >
              {timezoneOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">展示币种</Label>
            <select
              id="currency"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={displayCurrency}
              onChange={(event) => patchDraft({ displayCurrency: event.target.value })}
            >
              {currencyOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="density">表格密度</Label>
            <select
              id="density"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={tableDensity}
              onChange={(event) => patchDraft({ tableDensity: event.target.value })}
            >
              {DENSITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button
              size="sm"
              disabled={saveMutation.isPending || prefsQuery.isLoading}
              onClick={() =>
                saveMutation.mutate({
                  defaultShopId: defaultShopId || null,
                  timezone,
                  displayCurrency,
                  tableDensity,
                })
              }
            >
              {saveMutation.isPending ? '保存中…' : '保存偏好'}
            </Button>
          </div>
          {notice ? (
            <p role="status" className={`text-sm sm:col-span-2 ${noticeError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {notice}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
