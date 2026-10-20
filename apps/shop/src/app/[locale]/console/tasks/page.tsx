"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Topbar } from "@/components/topbar"
import {
  filterTasks,
  getDefaultTaskDateRange,
  TASKS,
  type Task,
  type TaskFilters,
} from "@/lib/tasks-data"
import { TasksFilters } from "./_components/tasks-filters"
import { TasksTable } from "./_components/tasks-table"

export default function TasksPage() {
  const t = useTranslations("Console.nav")
  const defaultRange = getDefaultTaskDateRange()

  const [filters, setFilters] = useState<TaskFilters>({
    taskId: "",
    type: "all",
    status: "all",
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
  })

  const filteredTasks = useMemo(
    () => filterTasks(TASKS, filters),
    [filters],
  )

  function handleViewDetail(task: Task) {
    toast.info(`任务 ${task.id}`)
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <div className="flex flex-col gap-4">
          <TasksFilters
            filters={filters}
            onTaskIdChange={(taskId) =>
              setFilters((prev) => ({ ...prev, taskId }))
            }
            onTypeChange={(type) => setFilters((prev) => ({ ...prev, type }))}
            onStatusChange={(status) =>
              setFilters((prev) => ({ ...prev, status }))
            }
            onDateRangeChange={({ startDate, endDate }) =>
              setFilters((prev) => ({ ...prev, startDate, endDate }))
            }
          />
          <TasksTable tasks={filteredTasks} onViewDetail={handleViewDetail} />
        </div>
      </div>
    </>
  )
}
