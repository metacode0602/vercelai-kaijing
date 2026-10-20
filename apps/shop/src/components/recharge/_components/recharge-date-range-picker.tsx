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

interface RechargeDateRangePickerProps {
  startDate: Date | null
  endDate: Date | null
  onChange: (range: { startDate: Date | null; endDate: Date | null }) => void
  className?: string
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

export function RechargeDateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
}: RechargeDateRangePickerProps) {
  function handleSelect(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) {
      onChange({ startDate: null, endDate: null })
      return
    }

    const nextStart = toUtcDate(range.from)
    const nextEnd = range.to ? toUtcDate(range.to) : nextStart
    onChange({ startDate: nextStart, endDate: nextEnd })
  }

  const hasRange = startDate && endDate

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 max-w-[277px] w-[300px] justify-start gap-0 px-3 text-left font-normal",
            !hasRange && "text-muted-foreground",
            className,
          )}
        >
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            UTC+0
          </span>
          <Separator orientation="vertical" className="mx-2.5 h-3" />
          {hasRange ? (
            <>
              <span className="truncate text-sm text-foreground">
                {formatUtcDateInput(startDate)}
              </span>
              <CalendarIcon className="mx-1 size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm text-foreground">
                {formatUtcDateInput(endDate)}
              </span>
            </>
          ) : (
            <span className="text-sm">选择日期</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={startDate ?? new Date()}
          selected={
            startDate && endDate
              ? { from: startDate, to: endDate }
              : undefined
          }
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
