'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@workspace/ui/components/dialog'
import { LocaleLink } from '@/lib/i18n/navigation'
import { ShieldAlertIcon } from 'lucide-react'

interface Props {
  children: React.ReactNode
  /** Whether the org is verified — if true, guard passes through */
  verified: boolean
}

/**
 * Wraps a create/edit/delete button. If the org is not verified,
 * clicking shows a dialog prompting the user to complete real-name verification.
 */
export function VerificationGuard({ children, verified }: Props) {
  const t = useTranslations('Verify')
  const [open, setOpen] = useState(false)

  if (verified) {
    return <>{children}</>
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <span className="inline-block" onClick={() => setOpen(true)}>
          {children}
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-5 text-amber-500" />
            {t('guardTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('guardDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button asChild>
            <LocaleLink href="/console/verify">
              {t('goToVerify')}
            </LocaleLink>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
