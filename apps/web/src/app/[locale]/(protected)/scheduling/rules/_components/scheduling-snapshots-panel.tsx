/**
 * 设备池容量概览面板组件
 * §2.6 运营看板用
 */

interface PoolSummary {
  pool: string
  totalGpu: number
  allocatableGpu: number
  allocatedGpu: number
  deviceCount: number
}

const POOL_LABELS: Record<string, string> = {
  od: "按需池 (OD)",
  stable: "稳定池 (Stable)",
  ai: "AI 池",
}

const POOL_COLORS: Record<string, string> = {
  od: "bg-blue-50 border-blue-200",
  stable: "bg-green-50 border-green-200",
  ai: "bg-purple-50 border-purple-200",
}

export function SchedulingSnapshotsPanel({
  poolSummary,
}: {
  poolSummary: PoolSummary[]
}) {
  if (poolSummary.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        暂无设备快照数据，请先刷新快照。
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {poolSummary.map((pool) => {
        const utilization =
          pool.totalGpu > 0
            ? Math.round((pool.allocatedGpu / pool.totalGpu) * 100)
            : 0

        return (
          <div
            key={pool.pool}
            className={`rounded-lg border p-4 ${POOL_COLORS[pool.pool] ?? "bg-muted/30"}`}
          >
            <div className="mb-2 text-sm font-semibold text-foreground">
              {POOL_LABELS[pool.pool] ?? pool.pool}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>设备数</span>
                <span className="font-mono">{pool.deviceCount}</span>
              </div>
              <div className="flex justify-between">
                <span>总 GPU</span>
                <span className="font-mono">{pool.totalGpu}</span>
              </div>
              <div className="flex justify-between">
                <span>可分配</span>
                <span className="font-mono">{pool.allocatableGpu}</span>
              </div>
              <div className="flex justify-between">
                <span>已占用</span>
                <span className="font-mono">{pool.allocatedGpu}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span>占用率</span>
                <span className="font-mono font-bold">{utilization}%</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
