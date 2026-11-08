import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Label } from '@workspace/ui/components/label'
import { Input } from '@workspace/ui/components/input'

export default function ProfilePreferencesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">偏好</h2>
        <p className="text-sm text-muted-foreground">主题跟随 · 语言</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">界面偏好</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-lg gap-4">
          <div className="space-y-2">
            <Label htmlFor="theme">主题</Label>
            <Input id="theme" defaultValue="跟随系统" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lang">语言</Label>
            <Input id="lang" defaultValue="中文" disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
