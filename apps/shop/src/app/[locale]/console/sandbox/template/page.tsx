import { getSandboxTemplatePageData } from "@/lib/sandbox-template/data"
import { TemplatePageClient } from "./template-page-client"

export default async function SandboxTemplatePage() {
  const data = await getSandboxTemplatePageData()

  return <TemplatePageClient initialData={data} />
}
