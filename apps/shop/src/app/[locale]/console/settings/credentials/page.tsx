import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function SettingsCredentialsPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">平台凭证</h2>
        <p className="text-sm text-muted-foreground">OAuth / API Key 状态（不明文展示密钥）</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daraz LK</CardTitle>
          <CardDescription>OAuth 连接 · 密钥脱敏</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p>
              状态 <Badge variant="secondary">connected</Badge>
            </p>
            <p className="font-mono text-xs text-muted-foreground">key ····a91f</p>
          </div>
          <Button variant="outline" disabled>
            重连
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
