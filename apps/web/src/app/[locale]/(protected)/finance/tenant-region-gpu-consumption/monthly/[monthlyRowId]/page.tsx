import { AppShell } from '@/components/dashboard/app-shell'

import { TenantRegionGpuMonthlyDetailContent } from './_components/tenant-region-gpu-monthly-detail-content'

export default async function TenantRegionGpuMonthlyDetailPage({
  params,
}: {
  params: Promise<{ monthlyRowId: string }>
}) {
  const { monthlyRowId } = await params

  return (
    <AppShell>
      <TenantRegionGpuMonthlyDetailContent monthlyRowId={monthlyRowId} />
    </AppShell>
  )
}
