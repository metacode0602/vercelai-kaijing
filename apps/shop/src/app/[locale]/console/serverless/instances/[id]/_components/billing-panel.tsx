"use client"

import { Receipt } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { trpc } from "@/trpc/client"

function fmtMoney(v: string | number | null | undefined): string {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return "—"
  return `¥${n.toFixed(4)}`
}

function fmtTs(v: Date | string | null | undefined): string {
  if (!v) return "—"
  const d = typeof v === "string" ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("zh-CN", { hour12: false })
}

export function BillingPanel({ endpointId }: { endpointId: string }) {
  const { data, isLoading, error } = trpc.compute.serverlessBillingVisibility.useQuery({
    id: endpointId,
    limit: 30,
  })

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">加载计费数据...</div>
  }

  if (error || !data?.owned) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        无法加载计费信息，或无权访问该端点。
      </div>
    )
  }

  if (data.orchestratorType !== "waverless") {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        此端点走 SkyPilot 路径，账单请查看控制台「账单」页。Waverless 双账本仅适用于
        orchestratorType=waverless。
      </div>
    )
  }

  const contract = data.contract

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Receipt className="size-4 text-primary" />
          创建时价格合同（不可变）
        </h3>
        {!contract ? (
          <p className="mt-2 text-xs text-destructive">
            缺少合同快照：结算已拒绝扣款，请联系平台补齐后重建端点。
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">销售单价</dt>
              <dd className="font-medium text-foreground">
                {fmtMoney(contract.sellPricePerGpuHour)}/GPU·h
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">供应商成本费率（暂估）</dt>
              <dd className="font-medium text-foreground">
                {contract.supplierRateMissing
                  ? "未配置（创建时冻结为 0）"
                  : `${fmtMoney(contract.costRatePerGpuHour)}/GPU·h`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">币种</dt>
              <dd className="font-medium text-foreground">{contract.currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">快照 ID</dt>
              <dd className="truncate font-mono text-xs text-muted-foreground">
                {contract.snapshotId}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">结算窗口（近 30 条）</h3>
        {data.windows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">暂无结算窗口</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">窗口起</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 pr-3 font-medium">用量 (gpu·s)</th>
                  <th className="py-2 pr-3 font-medium">客户金额</th>
                  <th className="py-2 font-medium">供应商暂估</th>
                </tr>
              </thead>
              <tbody>
                {data.windows.map((w) => (
                  <tr key={w.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono">{fmtTs(w.windowStart)}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {w.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{Number(w.customerQuantity).toFixed(3)}</td>
                    <td className="py-2 pr-3">{fmtMoney(w.customerAmount)}</td>
                    <td className="py-2">{fmtMoney(w.supplierEstimatedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">客户账本</h3>
          {data.customerLedger.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">暂无客户账本行</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {data.customerLedger.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 border-b border-border/50 pb-2"
                >
                  <div>
                    <div className="font-medium text-foreground">{row.kind}</div>
                    <div className="text-muted-foreground">{fmtTs(row.createdAt)}</div>
                  </div>
                  <div className="text-right font-mono">{fmtMoney(row.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">供应商成本（暂估）</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            共绩暂估成本，非正式发票；与客户销售价独立。
          </p>
          {data.supplierCost.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">暂无成本行</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {data.supplierCost.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 border-b border-border/50 pb-2"
                >
                  <div>
                    <div className="font-medium text-foreground">{row.status}</div>
                    <div className="text-muted-foreground">{fmtTs(row.createdAt)}</div>
                  </div>
                  <div className="text-right font-mono">{fmtMoney(row.estimatedAmount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
