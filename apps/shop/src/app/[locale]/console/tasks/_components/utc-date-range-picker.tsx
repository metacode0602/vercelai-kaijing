"use client"

import { CalendarIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { formatUtcDateInput } from "@/lib/tasks-data"

interface UtcDateRangePickerProps {
  startDate: Date
  endDate: Date
  onChange: (range: { startDate: Date; endDate: Date }) => void
  className?: string
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

export function UtcDateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
}: UtcDateRangePickerProps) {
  function handleSelect(
    range: { from?: Date; to?: Date } | undefined,
  ) {
    if (!range?.from) return

    const nextStart = toUtcDate(range.from)
    const nextEnd = range.to ? toUtcDate(range.to) : nextStart
    onChange({ startDate: nextStart, endDate: nextEnd })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-8 max-w-[277px] justify-start gap-0 px-3 text-left font-normal",
            className,
          )}
        >
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            UTC+0
          </span>
          <Separator orientation="vertical" className="mx-2.5 h-3" />
          <span className="truncate text-sm">{formatUtcDateInput(startDate)}</span>
          <CalendarIcon className="mx-1 size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{formatUtcDateInput(endDate)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={startDate}
          selected={{ from: startDate, to: endDate }}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
