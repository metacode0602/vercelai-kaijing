import { AppShell } from '@/components/dashboard/app-shell'
import { createServerCaller } from '@/lib/trpc/server'
import { PayoutAccountsPanel } from './_components/payout-accounts-panel'
import type {
  PayoutAccountOwnerType,
  PayoutAccountStatus,
} from '@/lib/server/dataaccess/merchant/merchant-payout-account-review'

/**
 * 收款账户审核 `/merchant/payout-accounts`（DEC-F3 / DEC-F12）
 *
 * 平台运营侧工作台：审核商户提交的收款账户、驳回、停用，并查看审计日志。
 * 商户端（apps/merchant）只能提交与查看状态，**没有**任何审核入口。
 *
 * 筛选与分页走 URL searchParams，列表本身是数据库级分页
 * （count() + limit/offset，见 payoutAccountReviewDataAccess.listPage）。
 */
export default async function PayoutAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    status?: string
    ownerType?: string
    search?: string
  }>
}) {
  const sp = await searchParams

  const page = Math.max(1, Number(sp.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize) || 20))

  // URL 参数是字符串，按白名单收窄，避免非法值进入 tRPC input
  const status =
    sp.status && ['pending_review', 'active', 'rejected', 'disabled'].includes(sp.status)
      ? (sp.status as PayoutAccountStatus)
      : undefined
  const ownerType: PayoutAccountOwnerType | undefined =
    sp.ownerType === 'merchant' || sp.ownerType === 'supplier' ? sp.ownerType : undefined

  const caller = await createServerCaller()
  const [result, pending] = await Promise.all([
    caller.merchant.payoutAccount.list({
      page,
      pageSize,
      status,
      ownerType,
      search: sp.search,
    }),
    caller.merchant.payoutAccount.pendingCount(),
  ])

  return (
    <AppShell>
      <PayoutAccountsPanel
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        pendingCount={pending.total}
        status={status}
        ownerType={ownerType}
        search={sp.search}
      />
    </AppShell>
  )
}
