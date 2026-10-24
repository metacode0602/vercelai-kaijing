import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const OAUTH_PLATFORMS = new Set(['daraz', 'lazada', 'tiktok_shop'])

export default function SettingsCredentialsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">平台凭证</h2>
        <p className="text-sm text-muted-foreground">
          integration_credentials：kind / expiresAt / mask · payload_encrypted 不明文 · OAuth 重连
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MOCK_SHOPS.map((shop) => {
          const canOauth = OAUTH_PLATFORMS.has(shop.platform)
          const href = canOauth
            ? `/api/marketplace/oauth/authorize?platform=${shop.platform}&shopId=${shop.id}&locale=zh&region=${shop.region.toLowerCase()}`
            : undefined
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
                  {shop.credentialKind} · {shop.platform}/{shop.region}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p>
                    状态 <Badge variant="secondary">{shop.status}</Badge>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">key {shop.credentialMask}</p>
                  <p className="text-xs text-muted-foreground">
                    到期 {shop.credentialExpiresAt ?? '—'}
                  </p>
                </div>
                {href ? (
                  <Button variant="outline" asChild>
                    <a href={href}>重连</a>
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
