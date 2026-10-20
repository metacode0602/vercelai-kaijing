"use client"

import { toast } from "sonner"
import type { Instance } from "@/components/console-store"
import { PodList } from "../../../_components/pod-list"
import { PodLogs } from "../../../_components/pod-logs"

export interface WorkersPanelProps {
  endpoint: Instance
  selectedPodId: string | null
  onSelectPod: (podId: string) => void
  onRefresh: () => void
}

export function WorkersPanel({
  endpoint,
  selectedPodId,
  onSelectPod,
  onRefresh,
}: WorkersPanelProps) {
  return (
    <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[300px_1fr]">
      <PodList
        endpoint={endpoint}
        selectedPodId={selectedPodId}
        onSelectPod={onSelectPod}
        onRefresh={() => {
          onRefresh()
          toast.success("Pod 列表已刷新")
        }}
        compact
      />
      <PodLogs endpoint={endpoint} podId={selectedPodId} embedded />
    </div>
  )
}
