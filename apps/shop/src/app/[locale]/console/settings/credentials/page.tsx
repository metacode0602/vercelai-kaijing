'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'

const OAUTH_PLATFORMS = new Set(['daraz', 'lazada', 'tiktok_shop'])

export default function SettingsCredentialsPage() {
  const listQuery = trpc.shops.list.useQuery({ page: 1, pageSize: 100 })
  const rows = listQuery.data?.items ?? []
  const utils = trpc.useUtils()
  const queueReauth = trpc.shops.queueReauth.useMutation({
    onSuccess: async () => {
      await utils.shops.list.invalidate()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">平台凭证</h2>
        <p className="text-sm text-muted-foreground">来自 shops / integration_credentials；密文不明文展示。</p>
      </div>
      <UedPrototypeNotice>
        不再使用 MOCK_SHOPS。未授权店铺显示「待平台授权」；重连仅排队，不伪造 OAuth 成功。
      </UedPrototypeNotice>
      {listQuery.isLoading ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
      {!listQuery.isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无店铺凭证。请先在店铺连接创建草稿并完成真实授权。</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((shop) => {
          const canOauth = OAUTH_PLATFORMS.has(shop.platform)
          return (
            <Card key={shop.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <LocaleLink
                    href={`/console/settings/shops/${shop.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {shop.name}
                  </LocaleLink>
                </CardTitle>
                <CardDescription>
                  {shop.platformLabel}/{shop.region} · {shop.authStatus}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p>
                    状态 <Badge variant="secondary">{shop.authStatus}</Badge>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{shop.credentialMask}</p>
                  <p className="text-xs text-muted-foreground">到期 {shop.authExpiresAt}</p>
                </div>
                {canOauth ? (
                  <Button
                    variant="outline"
                    onClick={() => queueReauth.mutate({ id: shop.id })}
                    disabled={queueReauth.isPending}
                  >
                    排队重授权
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    未接入
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
