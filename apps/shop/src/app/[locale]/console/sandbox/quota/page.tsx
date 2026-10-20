import { getSandboxQuotaPageData } from "@/lib/sandbox-quota/data"
import { QuotaPageClient } from "./quota-page-client"

export default async function SandboxQuotaPage() {
  const data = await getSandboxQuotaPageData()

  return <QuotaPageClient initialData={data} />
}
