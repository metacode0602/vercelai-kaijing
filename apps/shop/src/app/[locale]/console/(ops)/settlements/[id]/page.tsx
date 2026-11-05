'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import {
  getAccountTransactions,
  getLogisticsFees,
  getSettlements,
  sumFeeBreakdown,
} from '@/lib/crossborder/finance-store'

export default function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = getSettlements().find((item) => item.id === id)
  if (!row) notFound()
  const { lines, ...rest } = row
  const view = {
    ...rest,
    feePlatform: row.fees.platform,
    feeLogistics: row.fees.logistics,
    feeAds: row.fees.ads,
    feeJsb: row.fees.jsb,
    feeRefunds: row.fees.refunds,
    feeFx: row.fees.fx,
    feeTotal: sumFeeBreakdown(row.fees),
    settlementLines: lines,
    logisticsFeeDetails: getLogisticsFees().filter((item) => item.settlementId === row.id),
    accountTransactions: getAccountTransactions().filter((item) => item.shop === row.shop),
  }
  return (
    <UedRecordDetail
      backHref="/console/settlements"
      moduleTitle="平台结算对账"
      module="settlements"
      row={view as unknown as Record<string, unknown>}
    />
  )
}
