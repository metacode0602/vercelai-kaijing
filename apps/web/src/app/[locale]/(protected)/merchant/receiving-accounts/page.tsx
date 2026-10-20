import { AppShell } from '@/components/dashboard/app-shell'
import { createServerCaller } from '@/lib/trpc/server'
import { ReceivingAccountPanel } from './_components/receiving-account-panel'

/**
 * 平台 → 商户 专用收款账户 `/merchant/receiving-accounts`
 *
 * 商户预付（对公转账）的前提：平台为该商户开设了至少一个启用的专用账户，
 * 否则商户端 `prepay.create` 会以 `NoReceivingAccountError` 拒绝建单。
 * 所以本页是「商户能否自助预付」的总开关。
 *
 * 列表走数据库级分页（count + limit/offset）。
 */
export default async function ReceivingAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ merchantId?: string; page?: string; pageSize?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize) || 20))
  const merchantId = sp.merchantId || undefined

  const caller = await createServerCaller()
  const [accounts, merchantList] = await Promise.all([
    caller.merchant.receivingAccount.list({ merchantId, page, pageSize }),
    caller.merchant.receivingAccount.merchantOptions({ page: 1, pageSize: 100 }),
  ])

  return (
    <AppShell>
      <ReceivingAccountPanel
        accounts={accounts}
        merchants={merchantList.items.map((m) => ({ id: m.id, name: m.name }))}
        total={accounts.total}
        initialMerchantId={merchantId ?? ''}
      />
    </AppShell>
  )
}
