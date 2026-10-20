import { AppShell } from '@/components/dashboard/app-shell'
import { BareMetalOrderSyncJobDetailContent } from '../../../_components/bare-metal-order-sync-job-detail-content'

interface BareMetalOrderSyncJobPageProps {
  params: Promise<{ id: string }>
}

export default async function BareMetalOrderSyncJobPage({ params }: BareMetalOrderSyncJobPageProps) {
  const { id } = await params

  return (
    <AppShell>
      <BareMetalOrderSyncJobDetailContent jobRunId={id} />
    </AppShell>
  )
}
