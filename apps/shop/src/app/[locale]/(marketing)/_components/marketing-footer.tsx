import { LocaleLink } from "@/lib/i18n/navigation"
import Image from "next/image"
import { ShoppingBag } from "lucide-react"
import { footerContent } from "../_content/landing"

const footerMutedTextClassName =
  "text-background/60 dark:text-foreground/60"

const footerLinkClassName =
  "min-w-0 truncate text-sm text-background/60 transition-colors hover:text-background dark:text-foreground/60 dark:hover:text-foreground lg:whitespace-nowrap"

const footerBorderClassName =
  "border-background/10 dark:border-foreground/10"

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: readonly { label: string; href: string }[]
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-6 overflow-hidden border-l pl-5 lg:flex-none lg:overflow-visible ${footerBorderClassName}`}
    >
      <span
        className={`min-w-0 truncate text-sm max-lg:truncate ${footerMutedTextClassName}`}
      >
        {title}
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        {links.map((link) => (
          <div
            key={`${title}-${link.label}`}
            className="flex min-w-0 w-full items-center overflow-hidden lg:overflow-visible"
          >
            {link.href.startsWith("mailto:") ? (
              <a
                href={link.href}
                title={link.label}
                className={footerLinkClassName}
              >
                {link.label}
              </a>
            ) : (
              <LocaleLink
                href={link.href}
                title={link.label}
                className={footerLinkClassName}
              >
                {link.label}
              </LocaleLink>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MarketingFooter() {
  return (
    <footer className="flex w-full flex-col items-center bg-foreground/95 text-background backdrop-blur-md [box-shadow:0_100vh_0_100vh_var(--foreground)] dark:border-t dark:border-border/30 dark:bg-card/95 dark:text-foreground dark:[box-shadow:0_100vh_0_100vh_var(--color-card)]">
      <div className="flex w-full max-w-[1360px] flex-col">
        <div className="flex min-w-0 flex-col gap-10 overflow-x-hidden px-5 py-8 sm:px-8 sm:gap-14 lg:flex-row lg:items-start lg:justify-between lg:gap-0 lg:overflow-visible">
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-8 overflow-x-hidden lg:max-w-none lg:flex-1 lg:overflow-visible">
            <div className="flex flex-col gap-4 items-start">
              <LocaleLink
                href="/"
                className="inline-flex shrink-0 items-center justify-center gap-2"
                aria-label="Open Shop"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShoppingBag
                    className="size-4"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm font-semibold">Open Shop</span>
              </LocaleLink>
              <p
                className={`max-w-[270px] min-w-0 text-base ${footerMutedTextClassName}`}
              >
                {footerContent.description}
              </p>
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-8 overflow-x-hidden sm:grid-cols-4 lg:w-[888px] lg:flex-none lg:gap-y-10 lg:overflow-visible max-sm:[&>*:nth-child(odd)]:border-l-0 sm:[&>*:first-child]:border-l-0 sm:[&>*:first-child]:pl-0">
            {footerContent.columns.map((column) => (
              <FooterColumn
                key={column.title}
                title={column.title}
                links={column.links}
              />
            ))}
          </div>
        </div>

        <div className="container mx-auto max-w-7xl px-4 py-6 sm:py-8">
          <div className="flex flex-col items-center justify-center gap-y-3 text-center sm:gap-y-4">
            <span className={`px-2 text-xs sm:text-sm ${footerMutedTextClassName}`}>
              Copyright ©2025-2027 天津聚链科技有限公司版权所有
            </span>
            <div
              className={`flex flex-col items-center justify-center gap-y-2 text-sm sm:flex-row sm:gap-x-4 sm:gap-y-0 ${footerMutedTextClassName}`}
            >
              <span className="transition-colors hover:text-background dark:hover:text-foreground">
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  津ICP备2023007973号-1
                </a>
              </span>
              <span className="hidden text-background/30 sm:inline dark:text-foreground/30">
                |
              </span>
              <div className="flex items-center gap-x-2">
                <Image
                  src="/images/gongan.jpg"
                  alt="beian"
                  width={16}
                  height={17}
                  className="h-4 w-auto shrink-0"
                />
                <span className="transition-colors hover:text-background dark:hover:text-foreground">
                  <a
                    href="http://www.beian.gov.cn/portal/registerSystemInfo"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    津公网安备12011402001495号
                  </a>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
