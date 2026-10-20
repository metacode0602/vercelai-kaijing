import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_CANDIDATES } from "@/lib/crossborder/mock-data"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default function CandidatesPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <h1 className="mb-3 text-xl font-semibold">选品候选</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead>类目</TableHead>
            <TableHead>分数</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_CANDIDATES.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell className="tabular-nums">{row.score}</TableCell>
              <TableCell>
                <Badge variant={row.status === "new" ? "secondary" : "default"}>
                  {row.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
