"use client"

import * as React from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { IconLoader2, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import type { TenantIdByPhoneQueryResult } from "@/lib/types/tenant-id-by-phone-query"

type Phase = "idle" | "querying" | "results"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function TenantIdList({ ids, names }: { ids: number[]; names: string[] }) {
  if (ids.length === 0) return <>—</>

  return (
    <div className="space-y-1">
      {ids.map((id, index) => {
        const name = names[index]?.trim()
        return (
          <div key={`${id}-${index}`} className="font-mono text-sm leading-snug">
            {name ? `${id}（${name}）` : String(id)}
          </div>
        )
      })}
    </div>
  )
}

export function CrmTenantIdQueryDialog({ open, onOpenChange }: Props) {
  const queryMutation = trpc.crm.tenants.queryTenantIdByPhone.useMutation()

  const [phase, setPhase] = React.useState<Phase>("idle")
  const [phone, setPhone] = React.useState("")
  const [result, setResult] = React.useState<TenantIdByPhoneQueryResult | null>(null)

  const loading = phase === "querying" || queryMutation.isPending

  const reset = React.useCallback(() => {
    setPhase("idle")
    setPhone("")
    setResult(null)
  }, [])

  React.useEffect(() => {
    if (open) return
    reset()
  }, [open, reset])

  const onQuery = async () => {
    if (!phone.trim()) {
      toast.error("请输入手机号")
      return
    }

    setPhase("querying")
    try {
      const data = await queryMutation.mutateAsync({ phone })
      setResult(data)
      setPhase("results")

      if (data.summary.userCount === 0) {
        toast.info("未找到该手机号对应的平台用户")
      } else {
        toast.success(
          `查询完成：找到 ${data.summary.userCount} 个用户，${data.summary.tenantCount} 个租户`,
        )
      }
    } catch (e) {
      setPhase("idle")
      toast.error(e instanceof Error ? e.message : "查询失败，请稍后重试")
    }
  }

  const onPhoneChange = (value: string) => {
    setPhone(value)
    if (result) {
      setResult(null)
      setPhase("idle")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-[40vw] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>租户 ID 查询</DialogTitle>
          <DialogDescription>
            输入手机号，调用平台 API 查询对应用户的租户 ID 及实名认证状态。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-id-query-phone">手机号</Label>
            <Input
              id="tenant-id-query-phone"
              placeholder="请输入 11 位手机号"
              value={phone}
              disabled={loading}
              inputMode="numeric"
              onChange={(e) => onPhoneChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void onQuery()
                }
              }}
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" disabled={loading} onClick={() => void onQuery()}>
              {phase === "querying" ? (
                <IconLoader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <IconSearch className="mr-2 size-4" />
              )}
              查询
            </Button>
          </div>

          {result ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription className="text-sm">
                  手机号 {result.phone} · 用户 {result.summary.userCount} 个 · 租户{" "}
                  {result.summary.tenantCount} 个
                </AlertDescription>
              </Alert>

              {result.rows.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  未找到该手机号对应的平台用户
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>用户 ID</TableHead>
                        <TableHead>昵称</TableHead>
                        <TableHead>平台手机号</TableHead>
                        <TableHead>租户 ID</TableHead>
                        <TableHead>实名认证</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="font-mono text-sm">{row.userId}</TableCell>
                          <TableCell>{row.nickname ?? "—"}</TableCell>
                          <TableCell className="text-sm">{row.phone || "—"}</TableCell>
                          <TableCell>
                            <TenantIdList ids={row.tenantIds} names={row.tenantNames} />
                          </TableCell>
                          <TableCell>
                            {row.realNameVerified ? (
                              <Badge variant="secondary">已认证</Badge>
                            ) : (
                              <Badge variant="outline">未认证</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
