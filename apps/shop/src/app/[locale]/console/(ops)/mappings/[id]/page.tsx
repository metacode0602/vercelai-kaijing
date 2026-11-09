'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'

export default function MappingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.mappings.get.useQuery({ id })
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const [bindOpen, setBindOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const confirmMutation = trpc.mappings.confirm.useMutation({
    onSuccess: async () => {
      await utils.mappings.get.invalidate({ id })
      await utils.mappings.list.invalidate()
      setBindOpen(false)
      setNotice('映射已确认并启用。')
    },
    onError: (error) => setNotice(error.message),
  })
  const unbindMutation = trpc.mappings.unbind.useMutation({
    onSuccess: async () => {
      await utils.mappings.get.invalidate({ id })
      await utils.mappings.list.invalidate()
      setNotice('已解绑内部 SKU，状态回待确认。')
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/mappings"
          title="加载映射…"
          description={`正在从数据库读取 ${id}…`}
        />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/mappings"
          title="未找到映射"
          description={query.error?.message ?? `映射 ${id} 不存在于当前组织。`}
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或新增 Seller SKU 映射。
        </p>
      </div>
    )
  }

  const row = query.data
  const relatedInfo = buildUedRelatedInfo('mappings', row as unknown as Record<string, unknown>, {})
  const skuOptions = skuCodesQuery.data ?? []

  const bindDialog = bindOpen ? (
    <UedDialog
      title="确认 / 绑定内部 SKU"
      description="将 Seller SKU 绑定到启用态内部 SKU，并置映射状态为启用。"
      fields={[
        {
          key: 'internalSku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : [row.internalSku || 'HSY000001001'],
          required: true,
          defaultValue: row.internalSku !== '—' ? row.internalSku : undefined,
        },
      ]}
      onClose={() => setBindOpen(false)}
      onSave={(values) => {
        confirmMutation.mutate({
          id: row.id,
          internalSku: values.internalSku || row.internalSku,
        })
      }}
      saveLabel={confirmMutation.isPending ? '保存中…' : '确认映射'}
    />
  ) : null

  return (
    <>
      {bindDialog}
      <UedRecordDetail
        backHref="/console/mappings"
        moduleTitle="Seller SKU 映射"
        module="mappings"
        idKey="id"
        titleKeys={['sellerSku', 'itemId']}
        row={row as unknown as Record<string, unknown>}
        relatedInfo={relatedInfo}
        notice="数据来自 seller_sku_mappings；异常映射禁止自动占库。真实平台同步仍为 stub。"
        extra={
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setBindOpen(true)}>
                确认 / 绑定
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={unbindMutation.isPending}
                onClick={() => unbindMutation.mutate({ id: row.id })}
              >
                解绑内部 SKU
              </Button>
              {row.listingId ? (
                <Button size="sm" variant="outline" asChild>
                  <LocaleLink href={`/console/listings/${encodeURIComponent(row.listingId)}`}>
                    打开关联刊登
                  </LocaleLink>
                </Button>
              ) : null}
            </div>
            <UedPrototypeNotice>
              绑定 / 解绑即时保存；平台侧 Item / SKU 同步接口暂未接通。
            </UedPrototypeNotice>
            {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
          </div>
        }
      />
    </>
  )
}
