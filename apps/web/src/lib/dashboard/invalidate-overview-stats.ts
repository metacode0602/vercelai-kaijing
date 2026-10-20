import type { trpc } from '@/lib/trpc/client'

type TrpcUtils = ReturnType<typeof trpc.useUtils>

/** 批次/设备变更后刷新资源总览统计 */
export function invalidateOverviewStats(utils: TrpcUtils) {
  void utils.supplier.overview.getStats.invalidate()
}
