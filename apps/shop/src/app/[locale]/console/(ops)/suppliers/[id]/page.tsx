'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { useSuppliers } from '@/lib/crossborder/supplier-store'

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const suppliers = useSuppliers()
  const row = suppliers.find((item) => item.code === id)
  if (!row) notFound()
  return (
    <UedRecordDetail
      backHref="/console/suppliers"
      moduleTitle="供应商管理"
      module="suppliers"
      idKey="code"
      titleKeys={['code', 'name']}
      row={row as unknown as Record<string, unknown>}
    />
  )
}
