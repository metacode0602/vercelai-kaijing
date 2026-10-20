export type TaskTypeId = "Deployment" | "Job" | "Development"

export type TaskStatusId =
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "Cancelled"

export interface Task {
  id: string
  instanceId: string
  type: TaskTypeId
  status: TaskStatusId
  createdAt: string
  completedAt: string | null
}

export interface TaskTypeFilterOption {
  value: "all" | TaskTypeId
  label: string
}

export interface TaskStatusFilterOption {
  value: "all" | TaskStatusId
  label: string
}

export interface TaskFilters {
  taskId: string
  type: "all" | TaskTypeId
  status: "all" | TaskStatusId
  startDate: Date
  endDate: Date
}

export const TASK_TYPE_OPTIONS: TaskTypeFilterOption[] = [
  { value: "all", label: "所有任务类型" },
  { value: "Deployment", label: "Deployment" },
  { value: "Job", label: "Job" },
  { value: "Development", label: "Development" },
]

export const TASK_STATUS_OPTIONS: TaskStatusFilterOption[] = [
  { value: "all", label: "所有任务状态" },
  { value: "Pending", label: "等待中" },
  { value: "Running", label: "运行中" },
  { value: "Succeeded", label: "成功" },
  { value: "Failed", label: "失败" },
  { value: "Cancelled", label: "已取消" },
]

export const TASK_TYPE_LABELS: Record<TaskTypeId, string> = {
  Deployment: "Deployment",
  Job: "Job",
  Development: "Development",
}

export const TASK_STATUS_LABELS: Record<TaskStatusId, string> = {
  Pending: "等待中",
  Running: "运行中",
  Succeeded: "成功",
  Failed: "失败",
  Cancelled: "已取消",
}

/** 演示数据；接入 API 后替换为真实数据源 */
export const TASKS: Task[] = []

export function getDefaultTaskDateRange(now = new Date()): {
  startDate: Date
  endDate: Date
} {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const startDate = new Date(Date.UTC(year, month, 1))
  const endDate = new Date(Date.UTC(year, month + 1, 0))
  return { startDate, endDate }
}

export function formatUtcDateInput(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const year = date.getUTCFullYear()
  return `${month}/${day}/${year}`
}

export function formatTaskDateTimeUtc(iso: string | null): string {
  if (!iso) return "—"
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso))

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`
}

function utcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function utcDayEndMs(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999,
  )
}

export function isTaskWithinUtcDateRange(
  iso: string,
  startDate: Date,
  endDate: Date,
): boolean {
  const timestamp = new Date(iso).getTime()
  return timestamp >= utcDayStartMs(startDate) && timestamp <= utcDayEndMs(endDate)
}

export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  const keyword = filters.taskId.trim().toLowerCase()

  return tasks.filter((task) => {
    if (keyword && !task.id.toLowerCase().includes(keyword)) return false
    if (filters.type !== "all" && task.type !== filters.type) return false
    if (filters.status !== "all" && task.status !== filters.status) return false
    if (!isTaskWithinUtcDateRange(task.createdAt, filters.startDate, filters.endDate)) {
      return false
    }
    return true
  })
}
