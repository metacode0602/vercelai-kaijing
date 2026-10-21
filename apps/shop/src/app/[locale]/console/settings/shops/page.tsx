import { PageDemoBanner } from '@/components/console/page-demo-banner'
import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'
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

export default function SettingsShopsPage() {
  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">店铺连接</h2>
          <p className="text-sm text-muted-foreground">连接健康与同步状态</p>
        </div>
        <Button disabled>添加店铺</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>店铺</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>区域</TableHead>
            <TableHead>币种</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>同步</TableHead>
            <TableHead>最近同步</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_SHOPS.map((shop) => (
            <TableRow key={shop.id}>
              <TableCell className="font-medium">{shop.name}</TableCell>
              <TableCell>{shop.platform}</TableCell>
              <TableCell>{shop.region}</TableCell>
              <TableCell>{shop.currency}</TableCell>
              <TableCell>
                <Badge variant="default">{shop.status}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{shop.syncStatus}</Badge>
              </TableCell>
              <TableCell className="text-sm">{shop.lastSyncAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
