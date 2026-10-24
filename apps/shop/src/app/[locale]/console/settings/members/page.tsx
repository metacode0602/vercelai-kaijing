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
import { labelStatus } from '@/lib/console/labels'

const MEMBERS = [
  { name: '店长 Demo', email: 'owner@example.com', role: 'owner' },
  { name: '运营 Demo', email: 'ops@example.com', role: 'member' },
]

export default function SettingsMembersPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">组织成员</h2>
          <p className="text-sm text-muted-foreground">组织成员（只读示例）</p>
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
                <Badge variant="secondary">{labelStatus(m.role)}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
