"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { FormSection } from "@/components/form-section"

export interface RuntimeConfigValues {
  envVars: string
  startCommand: string
  ports: string
}

export interface RuntimeConfigStepProps {
  values: RuntimeConfigValues
  onChange: <K extends keyof RuntimeConfigValues>(
    key: K,
    value: RuntimeConfigValues[K],
  ) => void
  variant?: "deploy" | "detail"
}

export function RuntimeConfigStep({
  values,
  onChange,
  variant = "deploy",
}: RuntimeConfigStepProps) {
  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>环境变量</Label>
        <Textarea
          value={values.envVars}
          onChange={(e) => onChange("envVars", e.target.value)}
          placeholder={"KEY=value\nANOTHER_KEY=another_value"}
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          每行一个环境变量，格式为 KEY=VALUE。保存后将在新启动的 Worker 上生效。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>启动命令</Label>
          <Input
            value={values.startCommand}
            onChange={(e) => onChange("startCommand", e.target.value)}
            placeholder="例如 python app.py --port 8000"
            className="font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>端口暴露</Label>
          <Input
            value={values.ports}
            onChange={(e) => onChange("ports", e.target.value)}
            placeholder="例如 8000,8080"
          />
          <p className="text-xs text-muted-foreground">多个端口用逗号分隔。</p>
        </div>
      </div>
    </div>
  )

  if (variant === "detail") return body

  return (
    <FormSection
      step={2}
      title="运行时配置"
      description="环境变量、启动命令与端口可在不更换镜像的情况下调整。"
    >
      {body}
    </FormSection>
  )
}
