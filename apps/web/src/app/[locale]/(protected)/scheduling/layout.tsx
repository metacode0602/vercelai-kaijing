/**
 * 调度规则管理页面布局
 * 提供侧边栏导航和页面容器
 */

import type { ReactNode } from "react"

export default async function SchedulingLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-foreground">调度管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理资源调度策略规则、查看设备池容量快照和审计日志。
        </p>
      </div>
      {children}
    </div>
  )
}
