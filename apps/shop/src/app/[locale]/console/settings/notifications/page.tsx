import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Label } from '@workspace/ui/components/label'
import { Switch } from '@workspace/ui/components/switch'
import { Input } from '@workspace/ui/components/input'

export default function SettingsNotificationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">通知 / 钉钉</h2>
        <p className="text-sm text-muted-foreground">Webhook 与告警开关</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">告警渠道</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="dingtalk">钉钉机器人</Label>
            <Switch id="dingtalk" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook">Webhook 地址</Label>
            <Input id="webhook" placeholder="https://…" disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
