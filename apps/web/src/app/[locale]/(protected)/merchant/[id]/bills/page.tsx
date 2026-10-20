import { AppShell } from '@/components/dashboard/app-shell'
import { createServerCaller } from '@/lib/trpc/server'
import { notFound } from 'next/navigation'
import { MerchantBillsContent } from '../../_components/merchant-bills-content'

interface MerchantBillsPageProps {
  params: Promise<{ id: string }>
}

export default async function MerchantBillsPage({ params }: MerchantBillsPageProps) {
  const { id } = await params
  const caller = await createServerCaller()
  try {
    await caller.merchant.getById({ id })
  } catch {
    notFound()
  }

  return (
    <AppShell>
      <MerchantBillsContent merchantId={id} />
    </AppShell>
  )
}
