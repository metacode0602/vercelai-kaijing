"use client"

import type { ApplicationTemplate } from "@/lib/apps-data"
import { LocaleLink } from "@/lib/i18n/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

interface AppsGridProps {
  applications: ApplicationTemplate[]
  selectedAppId: string
  viewDetailsLabel: string
  onSelectApp: (appId: string) => void
}

export function AppsGrid({
  applications,
  selectedAppId,
  viewDetailsLabel,
  onSelectApp,
}: AppsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {applications.map((app) => {
        const selected = selectedAppId === app.id
        return (
          <Card
            key={app.id}
            size="sm"
            className={cn(
              "cursor-pointer transition-colors hover:bg-muted/50",
              selected && "ring-2 ring-primary",
            )}
            onClick={() => onSelectApp(app.id)}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <Badge variant="secondary">{app.gpuType}</Badge>
                <Button variant="link" size="sm" className="h-auto p-0" asChild>
                  <LocaleLink
                    href={`/console/apps/${app.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {viewDetailsLabel}
                  </LocaleLink>
                </Button>
              </div>
              <CardTitle>{app.name}</CardTitle>
              <CardDescription>{app.image}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{app.deployTypeLabel}</Badge>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
