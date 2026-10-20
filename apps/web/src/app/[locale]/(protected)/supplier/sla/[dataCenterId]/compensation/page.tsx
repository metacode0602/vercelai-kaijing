import { AppShell } from '@/components/dashboard/app-shell'
import { SlaCompensationContent } from '../../_components/sla-compensation-content'

type PageProps = {
  params: Promise<{ dataCenterId: string }>
}

export default async function SupplierSlaCompensationPage({ params }: PageProps) {
  const { dataCenterId } = await params

  return (
    <AppShell>
      <SlaCompensationContent dataCenterId={dataCenterId} />
    </AppShell>
  )
}
