'use client'

import { Bot, ChevronDown, Cpu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import { getProductByPathname, PRODUCTS, type ProductId } from '@/lib/product-nav'
import { cn } from '@/lib/utils'

const PRODUCT_ICONS: Record<ProductId, React.ReactNode> = {
  gpus: <Cpu className="size-4 text-primary" />,
  'agent-sandbox': <Bot className="size-4 text-primary" />,
}

export function ProductSwitcher({ className }: { className?: string }) {
  const t = useTranslations('Product')
  const pathname = useLocalePathname()
  const currentProduct = getProductByPathname(pathname ?? '')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'mx-2 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg border border-sidebar-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent',
            className,
          )}
        >
          <span className="flex items-center gap-2">
            {PRODUCT_ICONS[currentProduct.id]}
            {t(currentProduct.titleKey)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {PRODUCTS.map((product) => (
          <DropdownMenuItem key={product.id} asChild>
            <LocaleLink href={product.href} className="flex items-center gap-2">
              {PRODUCT_ICONS[product.id]}
              <span>{t(product.titleKey)}</span>
            </LocaleLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
