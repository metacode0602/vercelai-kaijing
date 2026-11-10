'use client'

import * as React from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

const PLATFORMS = [
  {
    value: 'daraz',
    label: 'Daraz',
    console: 'Daraz Open Platform',
    consoleUrl: 'https://open.daraz.com',
  },
  {
    value: 'lazada',
    label: 'Lazada',
    console: 'Lazada Open Platform',
    consoleUrl: 'https://open.lazada.com',
  },
  {
    value: 'tiktok_shop',
    label: 'TikTok Shop',
    console: 'TikTok Partner Center',
    consoleUrl: 'https://partner.tiktokshop.com',
  },
] as const

type Platform = (typeof PLATFORMS)[number]['value']

function GuideBody({ baseUrl }: { baseUrl: string }) {
  const [platform, setPlatform] = React.useState<Platform>('daraz')
  const [callbackKey, setCallbackKey] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  const current = PLATFORMS.find((item) => item.value === platform) ?? PLATFORMS[0]
  const key = callbackKey.trim()
  const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/marketplace/${platform}/oauth/callback${
    key ? `/${encodeURIComponent(key)}` : ''
  }`

  async function copy() {
    try {
      await navigator.clipboard.writeText(callbackUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-3 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">1. 创建应用。</span>{' '}
          登录{' '}
          <a
            href={current.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {current.console}
          </a>{' '}
          创建或查看应用，记录 App Key 与 App Secret。
        </li>
        <li>
          <span className="font-medium text-foreground">2. 登记回调地址。</span>{' '}
          把下方地址原样填入平台的 Redirect / Callback URL；协议、域名、端口、路径必须完全一致。
        </li>
        <li>
          <span className="font-medium text-foreground">3. 保存配置。</span>{' '}
          在本页点击「添加应用」，选择平台与站点，粘贴 App Key / App Secret 后保存。
        </li>
        <li>
          <span className="font-medium text-foreground">4. 授权店铺。</span>{' '}
          回到「店铺连接」新增店铺或重新授权，平台会回调到该地址。
        </li>
      </ol>

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label>平台</Label>
          <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>独立回调标识（可选）</Label>
          <Input
            value={callbackKey}
            placeholder="例如 lk-app-01"
            onChange={(event) => setCallbackKey(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            平台强制每个应用使用不同回调路径时才需要填写。
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>回调地址</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={callbackUrl} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? '已复制' : '复制'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          如果平台只需要一个固定回调，可留空独立回调标识，使用默认地址。
        </p>
      </div>
    </div>
  )
}

export function MarketplaceAppSetupGuide({
  baseUrl,
  embedded = false,
}: {
  baseUrl: string
  /** 嵌入 Dialog 时去掉外层 Card，避免嵌套卡片 */
  embedded?: boolean
}) {
  if (embedded) {
    return <GuideBody baseUrl={baseUrl} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>如何获取平台应用凭据</CardTitle>
        <CardDescription>
          每个租户使用自己的开放平台应用。App Secret 只保存在服务端，保存后不可再次查看。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GuideBody baseUrl={baseUrl} />
      </CardContent>
    </Card>
  )
}
