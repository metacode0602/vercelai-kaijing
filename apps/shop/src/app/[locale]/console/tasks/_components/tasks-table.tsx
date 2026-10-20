"use client"

import { FileSearch } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import {
  formatTaskDateTimeUtc,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type Task,
  type TaskStatusId,
} from "@/lib/tasks-data"

const statusStyle: Record<
  TaskStatusId,
  { dot: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  Pending: { dot: "bg-chart-4", variant: "secondary" },
  Running: { dot: "bg-primary animate-pulse", variant: "default" },
  Succeeded: { dot: "bg-primary", variant: "secondary" },
  Failed: { dot: "bg-destructive", variant: "destructive" },
  Cancelled: { dot: "bg-muted-foreground", variant: "outline" },
}

interface TasksTableProps {
  tasks: Task[]
  onViewDetail?: (task: Task) => void
}

export function TasksTable({ tasks, onViewDetail }: TasksTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <Table className="min-w-[650px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-3">任务 ID</TableHead>
            <TableHead className="px-3">实例 ID</TableHead>
            <TableHead className="px-3">任务类型</TableHead>
            <TableHead className="px-3">任务状态</TableHead>
            <TableHead className="px-3">创建时间</TableHead>
            <TableHead className="px-3">完成时间</TableHead>
            <TableHead className="px-3 pl-[15px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const status = statusStyle[task.status]
            return (
              <TableRow key={task.id}>
                <TableCell className="px-3 font-mono text-xs">{task.id}</TableCell>
                <TableCell className="px-3 font-mono text-xs text-muted-foreground">
                  {task.instanceId}
                </TableCell>
                <TableCell className="px-3">{TASK_TYPE_LABELS[task.type]}</TableCell>
                <TableCell className="px-3">
                  <Badge variant={status.variant} className="gap-1">
                    <span className={cn("size-1.5 rounded-full", status.dot)} />
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </TableCell>
                <TableCell className="px-3 text-muted-foreground">
                  {formatTaskDateTimeUtc(task.createdAt)}
                </TableCell>
                <TableCell className="px-3 text-muted-foreground">
                  {formatTaskDateTimeUtc(task.completedAt)}
                </TableCell>
                <TableCell className="px-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => onViewDetail?.(task)}
                  >
                    详情
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {tasks.length === 0 ? (
        <Empty className="border-0 py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearch />
            </EmptyMedia>
            <EmptyTitle>No Data</EmptyTitle>
            <EmptyDescription>暂无任务数据</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </div>
  )
}
