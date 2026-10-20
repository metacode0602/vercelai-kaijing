'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { ChevronDown, ChevronRight, Gift } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface AccountBalanceDropdownProps {
  availableCredit?: number
  couponCount?: number
}

function formatHeaderBalance(amount: number) {
  return `$${amount.toFixed(4)}`
}

export function AccountBalanceDropdown({
  availableCredit = 0,
  couponCount = 0,
}: AccountBalanceDropdownProps) {
  const t = useTranslations('Common.balance')
  const formattedBalance = formatHeaderBalance(availableCredit)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 rounded-lg border-border px-3 font-normal shadow-none"
        >
          <Gift className="size-4 shrink-0" />
          <span className="text-sm text-foreground">{t('remaining')}:</span>
          <span className="text-sm font-medium tabular-nums text-emerald-600">{formattedBalance}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <div className="p-4">
          <h3 className="text-base font-semibold text-foreground">{t('accountBalance')}</h3>

          <div className="mt-3 space-y-1">
            <LocaleLink
              href="/billing"
              className="flex items-center justify-between rounded-md px-1 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className="text-muted-foreground">{t('availableCredit')}</span>
              <span className="flex items-center gap-1">
                <span className="font-medium tabular-nums text-emerald-600">{formattedBalance}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </span>
            </LocaleLink>

            <LocaleLink
              href="/billing"
              className="flex items-center justify-between rounded-md px-1 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className="text-muted-foreground">{t('coupons')}</span>
              <span className="flex items-center gap-1">
                <span className="font-medium tabular-nums text-foreground">{couponCount}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </span>
            </LocaleLink>
          </div>

          <LocaleLink
            href="/recharge"
            className="mt-4 flex h-10 w-full items-center justify-center rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent"
          >
            {t('recharge')}
          </LocaleLink>

          <LocaleLink
            href="/billing"
            className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700"
          >
            {t('goToBilling')}
            <span aria-hidden="true">→</span>
          </LocaleLink>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
