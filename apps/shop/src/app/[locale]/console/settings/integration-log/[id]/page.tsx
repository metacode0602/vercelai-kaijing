'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_AUDIT_LOGS } from '@/lib/crossborder/erp-ued-data'

export default function IntegrationLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_AUDIT_LOGS.find((item) => `${item.at}::${item.object}` === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/settings/integration-log" moduleTitle="接口与操作日志" module="integration-log" idKey="at" titleKeys={['action', 'object']} row={row as unknown as Record<string, unknown>} />
}
