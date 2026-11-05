'use client'

import { useParams } from 'next/navigation'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import * as React from 'react'

export default function PurchasesDetailRedirectPage() {
  const params = useParams<{ id: string }>()
  const router = useLocaleRouter()
  React.useEffect(() => {
    const id = decodeURIComponent(String(params.id || ''))
    router.replace(`/console/purchase-requests/${encodeURIComponent(id)}`)
  }, [params.id, router])
  return <p className="p-6 text-sm text-muted-foreground">正在跳转到采购申请详情…</p>
}
