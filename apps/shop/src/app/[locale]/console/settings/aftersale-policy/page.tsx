'use client'

import * as React from 'react'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { DetailPageHeader } from '@/components/console/detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type PolicyRow = {
  shopId: string
  shopName: string
  platform: string
  inventoryReleaseMode: string
  refundMode: string
  refundWaitDays: number
  refundAutoSupported: boolean
  updatedAt: string
}

export default function AftersalePolicySettingsPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.aftersale.policyList.useQuery()
  const shopsQuery = trpc.mappings.listShops.useQuery()
  const [drafts, setDrafts] = React.useState<Record<string, PolicyRow>>({})
  const [notice, setNotice] = React.useState('')

  const upsertMutation = trpc.aftersale.policyUpsert.useMutation({
    onSuccess: async (row) => {
      setNotice(`已保存 ${row.shopName} 售后策略`)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[row.shopId]
        return next
      })
      await utils.aftersale.policyList.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  // 合并：策略行 + 未配置策略的店铺（默认 manual）
  const merged: PolicyRow[] = React.useMemo(() => {
    const listRows = listQuery.data ?? []
    const shopRows = shopsQuery.data ?? []
    const byShop = new Map(listRows.map((r) => [r.shopId, r]))
    const result: PolicyRow[] = []
    for (const s of shopRows) {
      const p = byShop.get(s.id)
      if (p) {
        result.push(p)
      } else {
        result.push({
          shopId: s.id,
          shopName: s.name,
          platform: s.platform,
          inventoryReleaseMode: 'manual',
          refundMode: 'manual',
          refundWaitDays: 1,
          refundAutoSupported: ['lazada'].includes(s.platform.toLowerCase()),
          updatedAt: '',
        })
      }
    }
    return result
  }, [listQuery.data, shopsQuery.data])

  function draft(row: PolicyRow): PolicyRow {
    return drafts[row.shopId] ?? row
  }

  function setDraft(shopId: string, patch: Partial<PolicyRow>) {
    setDrafts((prev) => {
      const base = prev[shopId] ?? merged.find((m) => m.shopId === shopId)!
      return { ...prev, [shopId]: { ...base, ...patch } }
    })
  }

  function save(row: PolicyRow) {
    const d = draft(row)
    upsertMutation.mutate({
      shopId: d.shopId,
      inventoryReleaseMode: d.inventoryReleaseMode as 'manual' | 'auto',
      refundMode: d.refundMode as 'manual' | 'auto',
      refundWaitDays: d.refundWaitDays,
    })
  }

  return (
    <>
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '设置', href: '/console/settings' },
          { label: '售后策略', href: '/console/settings/aftersale-policy' },
        ]}
      />
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/settings"
          title="售后策略"
          description="按店铺分别设置未发货占库释放与店铺退款。占库释放只有手动/自动；退款另有等待天数，且仅在平台提供同意退款接口时可选自动。"
          badges={<Badge variant="outline">PostgreSQL</Badge>}
        />
        <UedPrototypeNotice>
          {'买家在 Lazada / Daraz 发起取消或退款后，系统定时拉取建档并按本页策略执行：占库释放与退款分开。详见 docs/design/aftersale-cancel-ingest-and-policy.md。'}
        </UedPrototypeNotice>

        {merged.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {listQuery.isLoading ? '加载中…' : '暂无店铺，请先在「店铺连接」添加。'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {merged.map((row) => {
              const d = draft(row)
              const refundAutoDisabled = !d.refundAutoSupported
              return (
                <div
                  key={row.shopId}
                  className="flex flex-col gap-3 rounded-md border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.shopName}</span>
                      <Badge variant="outline">{row.platform}</Badge>
                      {row.updatedAt ? (
                        <span className="text-xs text-muted-foreground">更新于 {row.updatedAt}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {/* 占库释放 */}
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">未发货占库释放</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={d.inventoryReleaseMode === 'manual' ? 'default' : 'outline'}
                          onClick={() => setDraft(row.shopId, { inventoryReleaseMode: 'manual' })}
                        >
                          手动
                        </Button>
                        <Button
                          size="sm"
                          variant={d.inventoryReleaseMode === 'auto' ? 'default' : 'outline'}
                          onClick={() => setDraft(row.shopId, { inventoryReleaseMode: 'auto' })}
                        >
                          自动
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.inventoryReleaseMode === 'auto'
                          ? '买家取消入库后立即释放未发货占库，不等退款确认。'
                          : '同步后出现在取消列表，人工点击「释放占库」。'}
                      </p>
                    </div>

                    {/* 店铺退款 */}
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">店铺退款</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={d.refundMode === 'manual' ? 'default' : 'outline'}
                          disabled={refundAutoDisabled && d.refundMode === 'auto'}
                          onClick={() => setDraft(row.shopId, { refundMode: 'manual' })}
                        >
                          手动
                        </Button>
                        <Button
                          size="sm"
                          variant={d.refundMode === 'auto' ? 'default' : 'outline'}
                          disabled={refundAutoDisabled}
                          onClick={() => setDraft(row.shopId, { refundMode: 'auto' })}
                        >
                          自动
                        </Button>
                        {d.refundMode === 'auto' ? (
                          <label className="flex items-center gap-1 text-xs">
                            等待
                            <input
                              type="number"
                              min={0}
                              value={d.refundWaitDays}
                              onChange={(e) =>
                                setDraft(row.shopId, {
                                  refundWaitDays: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-16 rounded border px-1 py-0.5"
                            />
                            天
                          </label>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {refundAutoDisabled
                          ? '当前店铺平台未提供同意退款接口，自动不可选。'
                          : d.refundMode === 'auto'
                            ? `申请满 ${d.refundWaitDays} 天后自动同意退款（受平台 SLA 约束）。`
                            : '只建退款记录，人工同意或拒绝。'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={upsertMutation.isPending || !drafts[row.shopId]}
                      onClick={() => save(row)}
                    >
                      {upsertMutation.isPending ? '保存中…' : '保存'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </div>
    </>
  )
}
