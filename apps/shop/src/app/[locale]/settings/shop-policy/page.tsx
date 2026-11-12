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
  inventoryPushEnabled: boolean
  priceWritebackEnabled: boolean
  updatedAt: string
}

export default function ShopPolicySettingsPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.aftersale.policyList.useQuery()
  const shopsQuery = trpc.mappings.listShops.useQuery()
  const [drafts, setDrafts] = React.useState<Record<string, PolicyRow>>({})
  const [notice, setNotice] = React.useState('')

  const upsertMutation = trpc.aftersale.policyUpsert.useMutation({
    onSuccess: async (row) => {
      setNotice(`已保存 ${row.shopName} 店铺策略`)
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
          inventoryPushEnabled: true,
          priceWritebackEnabled: true,
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
      inventoryPushEnabled: d.inventoryPushEnabled,
      priceWritebackEnabled: d.priceWritebackEnabled,
    })
  }

  return (
    <>
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '设置', href: '/settings' },
          { label: '店铺策略', href: '/settings/shop-policy' },
        ]}
      />
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/settings"
          title="店铺策略"
          description="按店铺设置可选功能：售后占库释放与退款，以及是否向平台推送库存、回写售价。开关默认开启；关闭后不会调用对应平台写入接口，也不会假装成功。"
          badges={<Badge variant="outline">PostgreSQL</Badge>}
        />
        <UedPrototypeNotice>
          售后策略仍按店铺执行占库释放与退款。库存推送与改价回写是店铺级可选功能，默认打开；定价计算器不会自动把建议价回写到平台。
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

                  <div className="text-sm font-medium">售后策略</div>
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

                  <div className="text-sm font-medium">同步与回写</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">库存推送</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={d.inventoryPushEnabled ? 'default' : 'outline'}
                          onClick={() => setDraft(row.shopId, { inventoryPushEnabled: true })}
                        >
                          开启
                        </Button>
                        <Button
                          size="sm"
                          variant={!d.inventoryPushEnabled ? 'default' : 'outline'}
                          onClick={() => setDraft(row.shopId, { inventoryPushEnabled: false })}
                        >
                          关闭
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.inventoryPushEnabled
                          ? '开启后，将把本地可售库存推送到该店铺已发布的平台刊登。Daraz / Lazada 走官方改价库存接口；其他平台若尚未接入会如实记失败。'
                          : '已关闭：不会调用平台库存写入，任务将记为「该店铺已关闭库存推送」。'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">改价回写</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={d.priceWritebackEnabled ? 'default' : 'outline'}
                          onClick={() => setDraft(row.shopId, { priceWritebackEnabled: true })}
                        >
                          开启
                        </Button>
                        <Button
                          size="sm"
                          variant={!d.priceWritebackEnabled ? 'default' : 'outline'}
                          onClick={() => setDraft(row.shopId, { priceWritebackEnabled: false })}
                        >
                          关闭
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.priceWritebackEnabled
                          ? '开启后，在刊登改价或入队价格同步时把 ERP 售价回写到平台。定价计算器的建议价不会自动回写。'
                          : '已关闭：不会调用平台改价接口，任务将记为「该店铺已关闭改价回写」。'}
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
