import { AppShell } from '@/components/dashboard/app-shell'
import { GpuCardTypeDetailContent } from '../../components/gpu-card-type-detail-content'

interface GpuCardTypeDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function GpuCardTypeDetailPage({ params }: GpuCardTypeDetailPageProps) {
  const { id } = await params

  return (
    <AppShell>
      <GpuCardTypeDetailContent cardTypeId={id} />
    </AppShell>
  )
}
