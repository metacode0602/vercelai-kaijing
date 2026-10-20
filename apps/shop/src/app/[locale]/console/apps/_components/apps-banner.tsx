"use client"

import { X } from "lucide-react"
import { LocaleLink } from "@/lib/i18n/navigation"
import type { BannerSlide } from "@/lib/apps-data"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

interface AppsBannerProps {
  banner: BannerSlide
  onDismiss: () => void
}

export function AppsBanner({ banner, onDismiss }: AppsBannerProps) {
  return (
    <Alert>
      <AlertTitle>{banner.title}</AlertTitle>
      <AlertDescription>
        {banner.subtitlePrefix}
        <span className="font-medium text-foreground">{banner.subtitleHighlight}</span>
      </AlertDescription>
      <AlertAction className="flex items-center gap-2">
        <Button size="sm" asChild>
          <LocaleLink href="/instances/deploy">{banner.ctaLabel}</LocaleLink>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="关闭横幅"
          onClick={onDismiss}
        >
          <X />
        </Button>
      </AlertAction>
    </Alert>
  )
}
