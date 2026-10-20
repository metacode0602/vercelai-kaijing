"use client"

import { Search } from "lucide-react"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  TASK_STATUS_OPTIONS,
  TASK_TYPE_OPTIONS,
  type TaskFilters,
} from "@/lib/tasks-data"
import { UtcDateRangePicker } from "./utc-date-range-picker"

interface TasksFiltersProps {
  filters: TaskFilters
  onTaskIdChange: (taskId: string) => void
  onTypeChange: (type: TaskFilters["type"]) => void
  onStatusChange: (status: TaskFilters["status"]) => void
  onDateRangeChange: (range: { startDate: Date; endDate: Date }) => void
}

export function TasksFilters({
  filters,
  onTaskIdChange,
  onTypeChange,
  onStatusChange,
  onDateRangeChange,
}: TasksFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="h-8 w-[234px] pl-8 pr-8 hover:border-input-hover focus:border-input-hover"
          placeholder="任务 ID"
          value={filters.taskId}
          onChange={(event) => onTaskIdChange(event.target.value)}
        />
      </div>

      <Select value={filters.type} onValueChange={onTypeChange}>
        <SelectTrigger className="h-8 w-[160px]">
          <SelectValue placeholder="所有任务类型" />
        </SelectTrigger>
        <SelectContent>
          {TASK_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-8 w-[160px]">
          <SelectValue placeholder="所有任务状态" />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <UtcDateRangePicker
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={onDateRangeChange}
      />
    </div>
  )
}
