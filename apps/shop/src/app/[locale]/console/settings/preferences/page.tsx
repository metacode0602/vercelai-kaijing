import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Label } from '@workspace/ui/components/label'
import { Input } from '@workspace/ui/components/input'

export default function SettingsPreferencesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">偏好</h2>
        <p className="text-sm text-muted-foreground">默认店铺 / 时区 / 币种（示例）</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">运营默认值</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="shop">默认店铺</Label>
            <Input id="shop" defaultValue="Daraz LK · Demo" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tz">时区</Label>
            <Input id="tz" defaultValue="Asia/Colombo" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">展示币种</Label>
            <Input id="currency" defaultValue="USD" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="density">表格密度</Label>
            <Input id="density" defaultValue="舒适" disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
