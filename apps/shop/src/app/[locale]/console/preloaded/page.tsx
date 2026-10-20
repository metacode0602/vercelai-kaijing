"use client"

import { useCallback, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Topbar } from "@/components/topbar"
import { Button } from "@workspace/ui/components/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  createPreloadTask,
  filterPreloadTasks,
  MAX_PRELOAD_TASKS,
  type PreloadFilters,
  type PreloadTask,
} from "@/lib/preloaded-data"
import { CreatePreloadDialog } from "./_components/create-preload-dialog"
import { PreloadedFilters } from "./_components/preloaded-filters"
import { PreloadedTable } from "./_components/preloaded-table"
import { QuotaIndicator } from "./_components/quota-indicator"

export default function PreloadedPage() {
  const t = useTranslations("Console.pages.preloaded")
  const [tasks, setTasks] = useState<PreloadTask[]>([])
  const [filters, setFilters] = useState<PreloadFilters>({
    query: "",
    region: "all",
    status: "all",
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PreloadTask | null>(null)

  const filteredTasks = useMemo(
    () => filterPreloadTasks(tasks, filters),
    [tasks, filters],
  )

  const simulateProgress = useCallback((taskId: string) => {
    let progress = 0
    const timer = window.setInterval(() => {
      progress += Math.random() * 18 + 8
      if (progress >= 100) {
        window.clearInterval(timer)
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? { ...task, status: "ready", progress: 100 }
              : task,
          ),
        )
        return
      }
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, progress: Math.min(Math.round(progress), 99) } : task,
        ),
      )
    }, 900)
  }, [])

  function handleCreate(input: { imageRef: string; note: string; regionId: string }) {
    const task = createPreloadTask(input)
    setTasks((prev) => [task, ...prev])
    simulateProgress(task.id)
    return task
  }

  function handleDelete() {
    if (!deleteTarget) return
    setTasks((prev) => prev.filter((task) => task.id !== deleteTarget.id))
    toast.success(`已删除预热任务：${deleteTarget.imageName}`)
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <p className="mb-4 text-sm text-muted-foreground">
          {t("banner.prefix")}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => toast.info("标准存储费用在创建实例时按实际用量计费")}
          >
            {t("banner.storageFee")}
          </button>
          {t("banner.middle")}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => toast.info("帮助文档即将上线")}
          >
            {t("banner.helpDoc")}
          </button>
          {t("banner.suffix")}
        </p>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3"
              onClick={() => setCreateOpen(true)}
              disabled={tasks.length >= MAX_PRELOAD_TASKS}
            >
              {t("createTask")}
            </Button>
            <QuotaIndicator used={tasks.length} />
          </div>

          <PreloadedFilters
            filters={filters}
            onQueryChange={(query) => setFilters((prev) => ({ ...prev, query }))}
            onRegionChange={(region) => setFilters((prev) => ({ ...prev, region }))}
            onStatusChange={(status) => setFilters((prev) => ({ ...prev, status }))}
          />
        </div>

        <PreloadedTable tasks={filteredTasks} onDelete={setDeleteTarget} />
      </div>

      <CreatePreloadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        taskCount={tasks.length}
        onCreate={handleCreate}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除预热任务？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该区域节点缓存中的镜像将被清除，再次创建实例时需重新拉取镜像。
              {deleteTarget ? (
                <>
                  {" "}
                  镜像：<span className="font-mono text-foreground">{deleteTarget.imageRef}</span>
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
