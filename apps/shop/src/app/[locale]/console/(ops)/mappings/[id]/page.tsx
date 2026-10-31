'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { getMappingByRouteId, useMappings } from '@/lib/crossborder/mapping-store'

export default function MappingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  useMappings()
  const row = getMappingByRouteId(id)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/mappings"
          title={mounted ? '未找到映射' : '加载映射…'}
          description={
            mounted
              ? `映射 ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话中的映射…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或新增 Seller SKU 映射。
        </p>
      </div>
    )
  }

  return (
    <UedRecordDetail
      backHref="/console/mappings"
      moduleTitle="Seller SKU 映射"
      module="mappings"
      idKey="sellerSku"
      titleKeys={['sellerSku', 'itemId']}
      row={row as unknown as Record<string, unknown>}
      notice="自动带出内部 SKU、父 SPU、刊登、库存与主定价，异常映射禁止自动占库。"
    />
  )
}
