import { LocaleLink } from "@/lib/i18n/navigation"
import Image from "next/image"
import GPURunFullIcon from "@workspace/ui/components/icons/gpurun-full"

const footerMutedTextClassName =
  "text-background/60 dark:text-foreground/60"

const footerLinkClassName =
  "min-w-0 truncate text-sm text-background/60 transition-colors hover:text-background dark:text-foreground/60 dark:hover:text-foreground lg:whitespace-nowrap"

const footerBorderClassName =
  "border-background/10 dark:border-foreground/10"

const productLinks = [
  { label: "模型 APIs", href: "/models" },
  { label: "应用模板", href: "/apps" },
  { label: "Agent 沙盒", href: "/agent-sandbox" },
  { label: "智能体沙盒", href: "/console/sandbox" },
  { label: "Serverless GPU", href: "/serverless" },
  { label: "GPU 实例", href: "/console/server/list" },
  { label: "GPU 裸金属", href: "/bare-metal" },
]

const resourceLinks = [
  {
    label: "联系销售",
    href: "https://meetings-na2.hubspot.com/junyu",
    external: true,
  },
  { label: "联系支持", href: "mailto:support@gpurun.cn", external: true },
  { label: "定价", href: "/pricing" },
  { label: "文档", href: "https://docs.gpurun.cn", external: true },
]

const partnerLinks = [
  { label: "推荐赚取奖励", href: "/affiliate-new" },
  { label: "供应 GPUs", href: "mailto:gpu@gpurun.cn", external: true },
]

const companyLinks = [
  { label: "招聘", href: "/docs/guides/introduction" },
  { label: "博客", href: "/docs/guides/introduction" },
  { label: "服务条款", href: "/terms" },
  { label: "隐私政策", href: "/privacy" },
]

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string; external?: boolean }[]
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
            key={link.label}
            className="flex min-w-0 w-full items-center overflow-hidden lg:overflow-visible"
          >
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
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
                aria-label="GPURun"
              >
                <GPURunFullIcon className="block h-6 w-auto select-none" />
                <span className="text-sm font-semibold">GPURun</span>
              </LocaleLink>
              <p
                className={`max-w-[270px] min-w-0 text-base ${footerMutedTextClassName}`}
              >
                使用 GPURun 的模型 APIs、GPU 实例和智能体沙盒为您的 AI
                应用提供动力。
              </p>
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-8 overflow-x-hidden sm:grid-cols-4 lg:w-[888px] lg:flex-none lg:gap-y-10 lg:overflow-visible max-sm:[&>*:nth-child(odd)]:border-l-0 sm:[&>*:first-child]:border-l-0 sm:[&>*:first-child]:pl-0">
            <FooterColumn title="产品" links={productLinks} />
            <FooterColumn title="资源" links={resourceLinks} />
            <FooterColumn title="合作伙伴" links={partnerLinks} />
            <FooterColumn title="公司" links={companyLinks} />
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
