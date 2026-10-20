"use client"

import { useState } from "react"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { SandboxCodeSection } from "@/lib/sandbox-overview/types"

interface SandboxCodePanelProps {
  section: SandboxCodeSection
}

export function SandboxCodePanel({ section }: SandboxCodePanelProps) {
  const [activeTabId, setActiveTabId] = useState(section.defaultTabId)

  const activeTab =
    section.tabs.find((tab) => tab.id === activeTabId) ?? section.tabs[0]

  function handleCopy() {
    if (!activeTab) return

    void navigator.clipboard.writeText(activeTab.code)
    toast.success("代码已复制")
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {section.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                activeTabId === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-md bg-muted hover:bg-muted/80"
          onClick={handleCopy}
          aria-label="复制代码"
          title="复制代码"
        >
          <Copy className="size-3 text-muted-foreground" />
        </Button>
      </div>

      <pre className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
        <code>{activeTab?.code}</code>
      </pre>
    </div>
  )
}
