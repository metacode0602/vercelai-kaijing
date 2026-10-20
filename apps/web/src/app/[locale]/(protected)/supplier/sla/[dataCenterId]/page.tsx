import { AppShell } from '@/components/dashboard/app-shell'
import { SlaDetailContent } from '../_components/sla-detail-content'

type PageProps = {
  params: Promise<{ dataCenterId: string }>
}

export default async function SupplierSlaDetailPage({ params }: PageProps) {
  const { dataCenterId } = await params

  return (
    <AppShell>
      <SlaDetailContent dataCenterId={dataCenterId} />
    </AppShell>
  )
}
