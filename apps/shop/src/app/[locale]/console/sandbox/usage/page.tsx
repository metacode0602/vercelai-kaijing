import { getSandboxUsagePageData } from "@/lib/sandbox-usage/data"
import { UsagePageClient } from "./usage-page-client"

export default async function SandboxUsagePage() {
  const data = await getSandboxUsagePageData()

  return <UsagePageClient initialData={data} />
}
