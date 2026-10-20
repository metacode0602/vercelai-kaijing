import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Info } from "lucide-react"

export function CrossborderDemoAlert() {
  return (
    <Alert className="mb-6">
      <Info className="size-4" />
      <AlertTitle>Demo · 未接 tRPC</AlertTitle>
      <AlertDescription>
        本页为跨境运营工作台 UI 壳（mock 数据），未接入业务 tRPC / Daraz / MCP。
      </AlertDescription>
    </Alert>
  )
}
