import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_TENANTS } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function CrossborderTenantsPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h2 className="mb-3 text-lg font-medium">租户列表</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>店铺</TableHead>
            <TableHead>待审</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_TENANTS.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="font-mono text-xs">{t.slug}</TableCell>
              <TableCell>
                <Badge variant={t.status === "active" ? "default" : "secondary"}>
                  {t.status}
                </Badge>
              </TableCell>
              <TableCell>{t.shops}</TableCell>
              <TableCell>{t.pending}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
