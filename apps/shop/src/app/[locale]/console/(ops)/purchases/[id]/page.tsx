'use client'

import * as React from 'react'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'

/** 旧「采购管理」详情入口：统一跳转到采购申请详情（两步 UED）。 */
export default function PurchasesDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const router = useLocaleRouter()
  React.useEffect(() => {
    router.replace(`/console/purchase-requests/${encodeURIComponent(id)}`)
  }, [id, router])
  return (
    <p className="p-6 text-sm text-muted-foreground">
      正在跳转到采购申请详情…
    </p>
  )
}
