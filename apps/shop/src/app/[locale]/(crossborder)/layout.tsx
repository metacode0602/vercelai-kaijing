import { CrossborderSidebar } from "@/components/crossborder/crossborder-sidebar"
import type { ReactNode } from "react"

export default function CrossborderGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <CrossborderSidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
