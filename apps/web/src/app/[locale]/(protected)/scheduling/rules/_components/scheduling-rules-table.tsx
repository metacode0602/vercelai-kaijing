/**
 * 调度规则列表表格组件
 */

"use client"

import { trpc } from "@/lib/trpc/client"
import { useRouter } from "next/navigation"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rule = Record<string, any>

export function SchedulingRulesTable({
  rules,
  total,
}: {
  rules: Rule[]
  total: number
}) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const deleteMutation = trpc.scheduling.ruleDelete.useMutation({
    onSuccess: () => {
      utils.scheduling.ruleList.invalidate()
    },
  })

  function handleDelete(id: string) {
    if (confirm("确定删除该规则？")) {
      deleteMutation.mutate({ id })
    }
  }

  function handleToggle(id: string, enabled: boolean) {
    trpc.scheduling.ruleUpdate.useMutation({
      onSuccess: () => utils.scheduling.ruleList.invalidate(),
    }).mutate({ id, enabled: !enabled })
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="px-4 py-3 font-medium">优先级</th>
            <th className="px-4 py-3 font-medium">名称</th>
            <th className="px-4 py-3 font-medium">匹配条件</th>
            <th className="px-4 py-3 font-medium">动作</th>
            <th className="px-4 py-3 font-medium">范围</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                暂无调度规则
              </td>
            </tr>
          ) : (
            rules.map((rule) => (
              <tr key={rule.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs">{rule.priority}</td>
                <td className="px-4 py-3 font-medium">{rule.name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {rule.tenantTier?.map((t: string) => (
                      <span key={t} className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                        层级: {t}
                      </span>
                    ))}
                    {rule.productLine?.map((p: string) => (
                      <span key={p} className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                        产线: {p}
                      </span>
                    ))}
                    {rule.billingMode?.map((b: string) => (
                      <span key={b} className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                        计费: {b}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    {(rule.action as any)?.priorityClass ?? "unknown"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{rule.scope}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(rule.id, rule.enabled)}
                    className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      rule.enabled ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        rule.enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <a
                      href={`/scheduling/rules/${rule.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      编辑
                    </a>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {total > 0 && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          共 {total} 条规则
        </div>
      )}
    </div>
  )
}
