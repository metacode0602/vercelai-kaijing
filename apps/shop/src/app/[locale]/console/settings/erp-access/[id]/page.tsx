'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_ROLES } from '@/lib/crossborder/erp-ued-data'

export default function ErpAccessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_ROLES.find((item) => item.role === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/settings/erp-access" moduleTitle="角色与数据范围" module="erp-access" idKey="role" titleKeys={['role', 'person']} row={row as unknown as Record<string, unknown>} />
}
