"use client"

import type { CommitmentOption } from "@/lib/apps-data"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

interface DeployFooterProps {
  selectedCommitment: CommitmentOption
  pricePerHour: number
  diskTotalLabel: string
  diskPricePerDay: string
  deployCtaLabel: string
  deploying: boolean
  onDeploy: () => void
}

export function DeployFooter({
  selectedCommitment,
  pricePerHour,
  diskTotalLabel,
  diskPricePerDay,
  deployCtaLabel,
  deploying,
  onDeploy,
}: DeployFooterProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{selectedCommitment.name}</CardTitle>
          <CardDescription>{selectedCommitment.description}</CardDescription>
        </div>
        <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-2xl font-semibold text-primary">
                ${pricePerHour.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">/hr</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {diskTotalLabel} {diskPricePerDay}/day
            </p>
          </div>
          <Button className="w-full sm:w-48" onClick={onDeploy} disabled={deploying}>
            {deployCtaLabel}
          </Button>
        </div>
      </CardHeader>
    </Card>
  )
}
