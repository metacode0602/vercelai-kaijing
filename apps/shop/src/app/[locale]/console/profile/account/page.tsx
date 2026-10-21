import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'

export default function ProfileAccountPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">账号</h2>
        <p className="text-sm text-muted-foreground">姓名 / 邮箱 / 头像（mock）</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本资料</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-lg gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input id="name" defaultValue="Demo Operator" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" defaultValue="ops@example.com" disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
