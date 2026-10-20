"use client"

import { useState } from "react"
import { toast } from "sonner"
import { HardDrive, Plus, Trash2, Copy, Database, Globe } from "lucide-react"
import { useTranslations } from "next-intl"
import { Topbar } from "@/components/topbar"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Slider } from "@workspace/ui/components/slider"
import { Progress } from "@workspace/ui/components/progress"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useStore, type Volume } from "@/components/console-store"
import { REGIONS, formatUSD } from "@/lib/gpu-data"

export default function StoragePage() {
  const t = useTranslations("Console.pages.storage")
  const { volumes, addVolume, removeVolume } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [region, setRegion] = useState("us-west")
  const [size, setSize] = useState(100)
  const [detail, setDetail] = useState<Volume | null>(null)

  const monthlyPrice = (s: number) => s * 0.06

  function create() {
    if (!name.trim()) {
      toast.error("请输入卷名称")
      return
    }
    const vol = addVolume({
      name: name.trim().toLowerCase().replace(/\s+/g, "-"),
      region: REGIONS.find((r) => r.id === region)?.name ?? "美国西部 (US-WEST-01)",
      size,
    })
    toast.success("网络卷已创建")
    setOpen(false)
    setName("")
    setSize(100)
    setDetail(vol)
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text)
    toast.success(`${label}已复制`)
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground text-pretty">
            S3 标准网络卷可在实例间共享，提供持久化存储。计费约 {formatUSD(0.06)}/GB/月。
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            创建网络卷
          </Button>
        </div>

        {volumes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
            <HardDrive className="size-10 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">还没有网络卷</p>
            <p className="mt-1 text-xs text-muted-foreground">创建一个 S3 标准卷以持久化你的数据集与模型权重。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {volumes.map((v) => (
              <div key={v.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-accent">
                      <Database className="size-4 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{v.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{v.id}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <span className="size-1.5 rounded-full bg-primary" />
                    {v.status === "ready" ? "就绪" : "创建中"}
                  </Badge>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="size-3.5" />
                  {v.region}
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">已用 {v.used} GB</span>
                    <span className="font-medium text-foreground">{v.size} GB</span>
                  </div>
                  <Progress value={(v.used / v.size) * 100} className="h-1.5" />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setDetail(v)}>
                    S3 连接信息
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      removeVolume(v.id)
                      toast.success("网络卷已删除")
                    }}
                    aria-label="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建对话框 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建网络卷</DialogTitle>
            <DialogDescription>创建一个兼容 S3 标准协议的持久化网络卷。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>卷名称 / Bucket</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-datasets" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>区域</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.filter((r) => r.id !== "any").map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>容量</Label>
                <span className="text-sm font-medium text-foreground">{size} GB</span>
              </div>
              <Slider value={[size]} min={10} max={2000} step={10} onValueChange={(v) => setSize(v[0])} />
              <p className="text-xs text-muted-foreground">
                预计 {formatUSD(monthlyPrice(size))}/月
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={create}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* S3 连接信息 */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>S3 连接信息</DialogTitle>
            <DialogDescription>使用任意兼容 S3 的客户端（aws-cli、boto3、rclone）连接。</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="flex flex-col gap-3 py-2">
              <CredRow label="Endpoint" value={detail.endpoint} onCopy={copy} />
              <CredRow label="Region" value={detail.region.match(/\(([^)]+)\)/)?.[1] ?? "us-west-01"} onCopy={copy} />
              <CredRow label="Bucket" value={detail.bucket} onCopy={copy} />
              <CredRow label="Access Key" value={detail.accessKey} onCopy={copy} />
              <CredRow label="Secret Key" value={"••••••••••••••••••••（仅创建时可见）"} onCopy={copy} mono />
              <div className="mt-1 rounded-lg bg-muted p-3">
                <p className="mb-1 text-xs font-medium text-foreground">aws-cli 示例</p>
                <code className="block whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                  {`aws s3 ls s3://${detail.bucket} \\\n  --endpoint-url ${detail.endpoint}`}
                </code>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetail(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CredRow({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string
  value: string
  onCopy: (text: string, label: string) => void
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <Button variant="outline" size="icon" className="size-9 shrink-0" onClick={() => onCopy(value, label)} aria-label={`复制 ${label}`}>
          <Copy className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
