import { getCronSecret } from '@/lib/server/dataaccess/merchant/voucher-expiry-config'
import { sweepExpiredMerchantCoupons } from '@/lib/server/dataaccess/merchant/voucher-expiry-sweep'
import { NextResponse } from 'next/server'

/**
 * POST /api/internal/cron/merchant-voucher-expiry — 商户算力券过期回收（P1-12）。
 *
 * 与进程内 `register-voucher-expiry-cron` 是同一份逻辑的两个入口：
 * 进程内调度在实例重启/多实例下不可靠，这里给外部调度器（Vercel Cron / k8s
 * CronJob）一个确定的触发点。鉴权只认 `Authorization: Bearer <CRON_SECRET>`。
 */
export async function POST(request: Request) {
  const secret = getCronSecret()
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sweepExpiredMerchantCoupons('scheduled')
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
