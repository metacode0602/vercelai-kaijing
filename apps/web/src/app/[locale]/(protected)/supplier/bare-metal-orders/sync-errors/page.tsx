import { BareMetalSyncErrorsContent } from '../../_components/bare-metal-sync-errors-content'
import { AppShell } from '@/components/dashboard/app-shell'

type PageProps = {
  searchParams: Promise<{ jobRunId?: string }>
}

export default async function BareMetalSyncErrorsPage({ searchParams }: PageProps) {
  const params = await searchParams
  return (
  <AppShell>
    <BareMetalSyncErrorsContent initialJobRunId={params.jobRunId} />
  </AppShell>
  )
}
