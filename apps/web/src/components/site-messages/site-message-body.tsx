'use client'

import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { ExternalLink } from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { SiteMessageLink } from './types'

function isExternalHref(href: string | undefined): boolean {
  if (!href) return false
  return (
    /^https?:\/\//i.test(href) || href.startsWith('//') || href.startsWith('mailto:')
  )
}

type SiteMessageBodyProps = {
  content: string
  links?: SiteMessageLink[]
  className?: string
  onInternalNavigate?: () => void
}

export function SiteMessageBody({
  content,
  links,
  className,
  onInternalNavigate,
}: SiteMessageBodyProps) {
  const markdownComponents: Components = {
    p: ({ children }) => (
      <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
    ),
    h3: ({ children }) => (
      <h3 className="mt-4 mb-2 text-sm font-semibold text-foreground first:mt-0">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-3 mb-2 text-sm font-medium text-foreground first:mt-0">
        {children}
      </h4>
    ),
    ul: ({ children }) => (
      <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0 marker:text-muted-foreground/70">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0 marker:text-muted-foreground/70">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-medium text-foreground">{children}</strong>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-2 border-primary/30 bg-muted/40 px-3 py-2 text-sm last:mb-0 [&>p:last-child]:mb-0">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-4 border-border" />,
    a: ({ href, children }) => {
      if (isExternalHref(href)) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:opacity-80"
          >
            {children}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        )
      }

      return (
        <LocaleLink
          href={href ?? '#'}
          className="text-primary underline underline-offset-2 hover:opacity-80"
          onClick={onInternalNavigate}
        >
          {children}
        </LocaleLink>
      )
    },
  }

  return (
    <div className={cn('space-y-4', className)}>
      {content.trim() ? (
        <div className="text-sm text-muted-foreground [&>*:first-child]:mt-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : null}

      {links && links.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {links.map((link) =>
            link.external || isExternalHref(link.href) ? (
              <Button
                key={`${link.label}-${link.href}`}
                variant="outline"
                size="sm"
                asChild
              >
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            ) : (
              <Button
                key={`${link.label}-${link.href}`}
                variant="outline"
                size="sm"
                asChild
              >
                <LocaleLink href={link.href} onClick={onInternalNavigate}>
                  {link.label}
                </LocaleLink>
              </Button>
            )
          )}
        </div>
      ) : null}
    </div>
  )
}
