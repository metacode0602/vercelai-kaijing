import { CrossborderNav } from "@/components/crossborder/crossborder-nav"
import type { ReactNode } from "react"

export default function CrossborderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-2 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">跨境运营中枢</h1>
        <p className="text-muted-foreground text-sm">平台运营 · Demo</p>
      </div>
      <CrossborderNav />
      {children}
    </div>
  )
}
