"use client"

import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import type {
  SandboxGuideStep,
  SandboxOverviewAction,
} from "@/lib/sandbox-overview/types"
import { SandboxCodePanel } from "./sandbox-code-panel"

interface SandboxGuideStepsProps {
  steps: SandboxGuideStep[]
}

function StepActionButton({
  action,
  onAddApiKey,
}: {
  action: SandboxOverviewAction
  onAddApiKey?: () => void
}) {
  if (action.id === "add-api-key") {
    return (
      <Button size="sm" onClick={onAddApiKey}>
        {action.label}
      </Button>
    )
  }

  if (action.href) {
    return (
      <Button asChild variant="outline" size="sm">
        <LocaleLink href={action.href}>{action.label}</LocaleLink>
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm">
      {action.label}
    </Button>
  )
}

function StepHeader({
  step,
  onAddApiKey,
}: {
  step: SandboxGuideStep
  onAddApiKey?: () => void
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <span className="text-xs font-medium text-primary">
          {step.stepNumber}
        </span>
      </div>

      <h3 className="text-sm font-medium text-foreground">{step.title}</h3>

      {step.actions && step.actions.length > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {step.actions.map((action) => (
            <StepActionButton
              key={action.id}
              action={action}
              onAddApiKey={onAddApiKey}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function SandboxGuideSteps({ steps }: SandboxGuideStepsProps) {
  function handleAddApiKey() {
    toast.info("API Key 创建功能即将上线")
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      {steps.map((step) => (
        <div key={step.id} className="flex w-full flex-col gap-2">
          <StepHeader step={step} onAddApiKey={handleAddApiKey} />

          {step.description && (
            <p className="pl-8 text-xs text-muted-foreground">
              {step.description}
            </p>
          )}

          {step.codeSections && step.codeSections.length > 0 && (
            <div className="w-full pl-8">
              <div className="flex flex-col gap-4">
                {step.codeSections.map((section) => (
                  <SandboxCodePanel key={section.id} section={section} />
                ))}

                {step.runCommand && (
                  <div className="flex flex-col gap-2">
                    {step.runCommandHint && (
                      <p className="text-xs text-muted-foreground">
                        {step.runCommandHint}
                      </p>
                    )}
                    <SandboxCodePanel section={step.runCommand} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
