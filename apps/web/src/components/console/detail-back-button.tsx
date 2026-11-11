import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowLeftIcon } from 'lucide-react'

export function DetailBackButton({
  href,
  label = '返回',
  className,
}: {
  href: string
  label?: string
  className?: string
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn('-ml-2 h-8 px-2 text-muted-foreground', className)}
    >
      <LocaleLink href={href}>
        <ArrowLeftIcon className="size-4" />
        {label}
      </LocaleLink>
    </Button>
  )
}
