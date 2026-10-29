'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_BINS } from '@/lib/crossborder/erp-ued-data'

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_BINS.find((item) => item.code === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/warehouse" moduleTitle="仓库与库位" module="warehouse" idKey="code" titleKeys={['code', 'warehouse']} row={row as unknown as Record<string, unknown>} />
}
