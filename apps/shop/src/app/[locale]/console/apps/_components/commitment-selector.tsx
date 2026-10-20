"use client"

import { BadgePercent, CalendarCheck, Timer, type LucideIcon } from "lucide-react"
import type { CommitmentId, CommitmentOption } from "@/lib/apps-data"
import { cn } from "@/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"

const COMMITMENT_ICONS: Record<CommitmentId, LucideIcon> = {
  onDemand: Timer,
  monthly: CalendarCheck,
  spot: BadgePercent,
}

interface CommitmentSelectorProps {
  commitments: CommitmentOption[]
  commitment: CommitmentId
  title: string
  onCommitmentChange: (commitment: CommitmentId) => void
}

export function CommitmentSelector({
  commitments,
  commitment,
  title,
  onCommitmentChange,
}: CommitmentSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={commitment}
          onValueChange={(value) => value && onCommitmentChange(value as CommitmentId)}
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          {commitments.map((item) => {
            const Icon = COMMITMENT_ICONS[item.id]
            const selected = commitment === item.id

            return (
              <Label
                key={item.id}
                htmlFor={`commitment-${item.id}`}
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50",
                  selected && "border-primary ring-1 ring-primary",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.spotTag && (
                        <Badge variant="destructive">{item.spotTag}</Badge>
                      )}
                    </div>
                    <CardDescription className="p-0">{item.description}</CardDescription>
                  </div>
                </div>
                <RadioGroupItem id={`commitment-${item.id}`} value={item.id} />
              </Label>
            )
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
