import { getSandboxOverviewPageData } from "@/lib/sandbox-overview/data"
import { SandboxPageClient } from "./sandbox-page-client"

export default async function SandboxOverviewPage() {
  const data = await getSandboxOverviewPageData()

  return <SandboxPageClient initialData={data} />
}
