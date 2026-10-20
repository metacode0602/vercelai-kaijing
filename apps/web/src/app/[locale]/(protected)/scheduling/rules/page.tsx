/**
 * 调度规则列表页
 * §2.3.1 规则管理入口
 */

import { Suspense } from "react"
import { createServerCaller } from "@/lib/trpc/server"
import { SchedulingRulesTable } from "./_components/scheduling-rules-table"
import { SchedulingSnapshotsPanel } from "./_components/scheduling-snapshots-panel"

export default async function SchedulingRulesPage() {
  const caller = await createServerCaller()
  const rules = await caller.scheduling.ruleList({ page: 1, pageSize: 50 })
  const poolSummary = await caller.scheduling.snapshotPoolSummary()

  return (
    <div className="space-y-8">
      {/* §2.6 设备池容量概览 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">设备池容量概览</h2>
        <Suspense fallback={<div className="text-sm text-muted-foreground">加载中...</div>}>
          <SchedulingSnapshotsPanel poolSummary={poolSummary} />
        </Suspense>
      </section>

      {/* §2.3.1 规则列表 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">调度规则</h2>
          <a
            href="/scheduling/rules/new"
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            新建规则
          </a>
        </div>
        <Suspense fallback={<div className="text-sm text-muted-foreground">加载中...</div>}>
          <SchedulingRulesTable rules={rules.items} total={rules.total} />
        </Suspense>
      </section>
    </div>
  )
}
