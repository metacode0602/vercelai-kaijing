import { PageDemoBanner } from '@/components/console/page-demo-banner'
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

const MEMBERS = [
  { name: '店长 Demo', email: 'owner@example.com', role: 'owner' },
  { name: '运营 Demo', email: 'ops@example.com', role: 'member' },
]

export default function SettingsMembersPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">组织成员</h2>
          <p className="text-sm text-muted-foreground">Better Auth org 成员（只读 mock）</p>
        </div>
        <Button disabled>邀请成员</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>姓名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MEMBERS.map((m) => (
            <TableRow key={m.email}>
              <TableCell className="font-medium">{m.name}</TableCell>
              <TableCell>{m.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{m.role}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
