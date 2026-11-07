'use client'

import { useEffect } from 'react'
import { useLocaleRouter } from '@/lib/i18n/navigation'

/** 旧财务中心并存页：重定向至平台结算对账（导航方案 B）。 */
export default function FinanceRedirectPage() {
  const router = useLocaleRouter()
  useEffect(() => {
    router.replace('/console/settlements')
  }, [router])
  return <p className="text-sm text-muted-foreground">正在跳转到平台结算对账…</p>
}
