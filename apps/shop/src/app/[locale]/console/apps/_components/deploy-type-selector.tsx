"use client"

import { Check } from "lucide-react"
import type { DeployTypeId, DeployTypeOption } from "@/lib/apps-data"
import { cn } from "@/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

interface DeployTypeSelectorProps {
  deployTypes: DeployTypeOption[]
  deployType: DeployTypeId
  onDeployTypeChange: (deployType: DeployTypeId) => void
}

export function DeployTypeSelector({
  deployTypes,
  deployType,
  onDeployTypeChange,
}: DeployTypeSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {deployTypes.map((type) => {
        const selected = deployType === type.id
        const disabled = type.comingSoon

        return (
          <Card
            key={type.id}
            size="sm"
            className={cn(
              "transition-colors",
              disabled
                ? "opacity-60"
                : "cursor-pointer hover:bg-muted/50",
              selected && "ring-2 ring-primary",
            )}
            onClick={() => !disabled && onDeployTypeChange(type.id)}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{type.name}</CardTitle>
                {type.comingSoonLabel && (
                  <Badge variant="secondary">{type.comingSoonLabel}</Badge>
                )}
              </div>
              <CardDescription>{type.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Separator />
              <div className="flex flex-wrap gap-3">
                {type.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="size-3.5" aria-hidden="true" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
