'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelStatus, labeledOptions } from '@/lib/console/labels'

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'error') return 'destructive' as const
  if (status === 'connecting') return 'secondary' as const
  return 'outline' as const
}

const OAUTH_PLATFORMS = new Set(['daraz', 'lazada', 'tiktok_shop'])

const STATUSES = [...new Set(MOCK_SHOPS.map((s) => s.status))]
const PLATFORMS = [...new Set(MOCK_SHOPS.map((s) => s.platform))]

export default function SettingsShopsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')

  const rows = MOCK_SHOPS.filter((shop) => {
    if (!matchesKeyword(keyword, shop.name, shop.id, shop.externalShopId, shop.region)) return false
    if (status !== 'all' && shop.status !== status) return false
    if (platform !== 'all' && shop.platform !== platform) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">店铺连接</h2>
          <p className="text-sm text-muted-foreground">
            平台 / 区域 / 状态 / 平台店铺 ID · 授权连接走 OAuth
          </p>
        </div>
        <Button disabled>添加店铺</Button>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="店铺名 / ID / 区域"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: labeledOptions(STATUSES),
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: setPlatform,
            options: PLATFORMS.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="店铺列表" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>区域</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>平台店铺 ID</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>健康</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead>连接</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((shop) => {
                const canOauth = OAUTH_PLATFORMS.has(shop.platform)
                const href = canOauth
                  ? `/api/marketplace/oauth/authorize?platform=${shop.platform}&shopId=${shop.id}&locale=zh&region=${shop.region.toLowerCase()}`
                  : undefined
                return (
                  <TableRow key={shop.id}>
                    <TableCell className="font-medium">
                      <LocaleLink
                        href={`/console/settings/shops/${shop.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {shop.name}
                      </LocaleLink>
                    </TableCell>
                    <TableCell>{shop.platform}</TableCell>
                    <TableCell className="font-mono text-xs">{shop.region}</TableCell>
                    <TableCell>{shop.currency}</TableCell>
                    <TableCell className="font-mono text-xs">{shop.externalShopId}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(shop.status)}>{labelStatus(shop.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{labelStatus(shop.health)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{shop.lastSyncAt}</TableCell>
                    <TableCell>
                      {href ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={href}>授权登录</a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          未接入
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
