/**
 * 新建调度规则页面
 * §2.3.1 规则创建表单
 */

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { trpc } from "@/lib/trpc/client"

export default function NewSchedulingRulePage() {
  const router = useRouter()
  const utils = trpc.useUtils()

  const [name, setName] = useState("")
  const [priority, setPriority] = useState(0)
  const [description, setDescription] = useState("")
  const [scope, setScope] = useState<"global" | "tenant">("global")
  const [scopeId, setScopeId] = useState("")
  const [tenantTier, setTenantTier] = useState("")
  const [productLine, setProductLine] = useState("")
  const [billingMode, setBillingMode] = useState("")
  const [taskCategory, setTaskCategory] = useState("")
  const [actionType, setActionType] = useState<"route-to-od" | "route-to-stable" | "route-to-ai">("route-to-od")
  const [priorityClass, setPriorityClass] = useState<"od-high" | "od-normal" | "od-low">("od-normal")
  const [weight, setWeight] = useState(50)
  const [preemptionPenalty, setPreemptionPenalty] = useState(0)

  const createMutation = trpc.scheduling.ruleCreate.useMutation({
    onSuccess: () => {
      utils.scheduling.ruleList.invalidate()
      router.push("/scheduling/rules")
    },
    onError: (err) => {
      alert(err.message)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate({
      name,
      priority,
      description: description || null,
      scope,
      scopeId: scopeId || null,
      tenantTier: tenantTier ? tenantTier.split(",").map((s) => s.trim()) : null,
      productLine: productLine ? productLine.split(",").map((s) => s.trim()) : null,
      billingMode: billingMode ? billingMode.split(",").map((s) => s.trim()) : null,
      taskCategory: taskCategory ? taskCategory.split(",").map((s) => s.trim()) : null,
      action: {
        type: actionType,
        priorityClass,
        weight,
        preemptionPenalty,
      },
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">新建调度规则</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          创建资源调度策略规则。匹配条件留空表示通配（匹配所有）。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">基本信息</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">规则名称 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: 高层级租户优先"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">优先级（越大越优先）</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>
        </section>

        {/* 匹配条件 */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">匹配条件（留空 = 通配）</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">租户层级（逗号分隔）</label>
              <input
                type="text"
                value={tenantTier}
                onChange={(e) => setTenantTier(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: vip,enterprise"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">产品线（逗号分隔）</label>
              <input
                type="text"
                value={productLine}
                onChange={(e) => setProductLine(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: gpus,bare-metal"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">计费模式（逗号分隔）</label>
              <input
                type="text"
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: prepaid,postpaid"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">任务类别（逗号分隔）</label>
              <input
                type="text"
                value={taskCategory}
                onChange={(e) => setTaskCategory(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: training,inference"
              />
            </div>
          </div>
        </section>

        {/* 生效范围 */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">生效范围</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">范围</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "global" | "tenant")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="global">全局</option>
                <option value="tenant">指定租户</option>
              </select>
            </div>
            {scope === "tenant" && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">租户 ID</label>
                <input
                  type="text"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        </section>

        {/* 调度动作 */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">调度动作</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">路由目标</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as any)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="route-to-od">按需池 (OD)</option>
                <option value="route-to-stable">稳定池 (Stable)</option>
                <option value="route-to-ai">AI 池</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">优先级类别</label>
              <select
                value={priorityClass}
                onChange={(e) => setPriorityClass(e.target.value as any)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="od-high">高 (od-high)</option>
                <option value="od-normal">普通 (od-normal)</option>
                <option value="od-low">低 (od-low)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">权重 (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">抢占惩罚 (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={preemptionPenalty}
                onChange={(e) => setPreemptionPenalty(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        {/* 提交 */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? "创建中..." : "创建规则"}
          </button>
        </div>
      </form>
    </div>
  )
}
