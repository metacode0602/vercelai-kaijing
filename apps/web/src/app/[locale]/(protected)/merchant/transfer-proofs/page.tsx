import { AppShell } from '@/components/dashboard/app-shell'
import { createServerCaller } from '@/lib/trpc/server'
import { TransferProofPanel } from './_components/transfer-proof-panel'

/**
 * 平台侧对公转账凭证核销工作台
 *
 * 到账入账的唯一人工入口。默认只列 pending —— 这是「现在要处理什么」，
 * 已处理记录用筛选查看。
 */
export default async function TransferProofsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mismatch?: string; page?: string }>
}) {
  const sp = await searchParams
  const caller = await createServerCaller()

  const reviewStatus = (['pending', 'approved', 'rejected', 'cancelled'] as const).find(
    (s) => s === sp.status,
  ) ?? 'pending'
  const onlyMismatch = sp.mismatch === '1'
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const [result, summary] = await Promise.all([
    caller.merchant.transferProof.list({
      reviewStatus,
      onlyMismatch,
      page,
      pageSize: 20,
    }),
    caller.merchant.transferProof.pendingSummary(),
  ])

  return (
    <AppShell>
      <TransferProofPanel
        initial={result}
        summary={summary}
        reviewStatus={reviewStatus}
        onlyMismatch={onlyMismatch}
      />
    </AppShell>
  )
}
