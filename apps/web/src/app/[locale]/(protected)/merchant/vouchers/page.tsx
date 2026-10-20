import { AppShell } from '@/components/dashboard/app-shell'
import { createServerCaller } from '@/lib/trpc/server'
import { VoucherPanel } from './_components/voucher-panel'
import { COUPON_STATUSES, type CouponStatus } from '@workspace/billing'

/**
 * 平台侧算力券工作台 `/merchant/vouchers`
 *
 * 两个动作、两个口径：
 *   - `grant` 从商户券池**冻结**额度并建券；券池没额度就整笔失败，不会发空头券
 *   - `recover` 只释放**剩余**额度，已核销部分不动
 *
 * 列表是跨商户视角，所以每行都必须带商户名与租户名 —— 运营出问题时要能定位到人。
 */
export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    search?: string
    merchantId?: string
    page?: string
    pageSize?: string
  }>
}) {
  const sp = await searchParams
  const caller = await createServerCaller()

  // URL 上的 status 是任意字符串，必须先按领域白名单收窄再下传
  const status = (COUPON_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as CouponStatus)
    : undefined
  const search = sp.search?.trim() || undefined
  const merchantId = sp.merchantId?.trim() || undefined
  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize ?? '20') || 20))

  const [result, summary] = await Promise.all([
    caller.merchant.voucher.list({
      page,
      pageSize,
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      ...(merchantId ? { merchantId } : {}),
    }),
    caller.merchant.voucher.summary(),
  ])

  return (
    <AppShell>
      <VoucherPanel
        initial={result}
        summary={summary}
        filters={{ status: status ?? null, search: search ?? null, merchantId: merchantId ?? null }}
      />
    </AppShell>
  )
}
