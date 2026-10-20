"use client"

import { HardDriveDownload, Trash2 } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
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
  formatPreloadDateTime,
  PRELOAD_STATUS_LABELS,
  type PreloadStatus,
  type PreloadTask,
} from "@/lib/preloaded-data"

const statusStyle: Record<
  PreloadStatus,
  { dot: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  downloading: { dot: "bg-chart-4 animate-pulse", variant: "secondary" },
  ready: { dot: "bg-primary", variant: "default" },
  failed: { dot: "bg-destructive", variant: "destructive" },
}

interface PreloadedTableProps {
  tasks: PreloadTask[]
  onDelete: (task: PreloadTask) => void
}

export function PreloadedTable({ tasks, onDelete }: PreloadedTableProps) {
  if (tasks.length === 0) {
    return (
      <Empty className="border border-dashed border-border bg-card py-24">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HardDriveDownload />
          </EmptyMedia>
          <EmptyTitle>暂无数据</EmptyTitle>
          <EmptyDescription>创建镜像预热任务，将镜像预先下载到指定区域以加速实例启动。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-3">镜像</TableHead>
            <TableHead className="px-3">备注</TableHead>
            <TableHead className="px-3">地域</TableHead>
            <TableHead className="px-3">状态</TableHead>
            <TableHead className="px-3">大小</TableHead>
            <TableHead className="px-3">创建时间</TableHead>
            <TableHead className="px-3 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const status = statusStyle[task.status]
            return (
              <TableRow key={task.id}>
                <TableCell className="px-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {task.imageName}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {task.imageRef}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-3 text-sm text-muted-foreground">
                  {task.note || "—"}
                </TableCell>
                <TableCell className="px-3 text-sm">{task.regionName}</TableCell>
                <TableCell className="px-3">
                  <div className="flex min-w-[120px] flex-col gap-1.5">
                    <Badge variant={status.variant} className="w-fit gap-1">
                      <span className={cn("size-1.5 rounded-full", status.dot)} />
                      {PRELOAD_STATUS_LABELS[task.status]}
                    </Badge>
                    {task.status === "downloading" ? (
                      <Progress value={task.progress} className="h-1" />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-3 text-sm">{task.sizeGb} GB</TableCell>
                <TableCell className="px-3 text-sm text-muted-foreground">
                  {formatPreloadDateTime(task.createdAt)}
                </TableCell>
                <TableCell className="px-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(task)}
                    aria-label="删除预热任务"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
