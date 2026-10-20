import { AppShell } from '@/components/dashboard/app-shell'
import { MonthlyCostContent } from './_components/monthly-cost-content'

export default async function MonthlyCostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <AppShell>
      <MonthlyCostContent lockedBillingPeriodId={id} />
    </AppShell>
  )
}
