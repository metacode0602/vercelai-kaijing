import { AppShell } from '@/components/dashboard/app-shell'
import { createServerCaller } from '@/lib/trpc/server'
import { FinanceConfigPanel } from './_components/finance-config-panel'

/**
 * 商户财务配置 `/merchant/finance-config`（DEC-F7）
 *
 * 当前仅全局充值阻断阈值。列表与审计都是数据库级分页
 * （count() + limit/offset），阈值写入走 tRPC mutation 并强制写审计。
 */
export default async function FinanceConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize) || 20))

  const caller = await createServerCaller()
  const [threshold, audit] = await Promise.all([
    caller.merchant.financeConfig.getRechargeBlockThreshold(),
    caller.merchant.financeConfig.auditLog({ page, pageSize }),
  ])

  return (
    <AppShell>
      <FinanceConfigPanel
        threshold={threshold.value}
        configured={threshold.configured}
        audit={audit}
      />
    </AppShell>
  )
}
