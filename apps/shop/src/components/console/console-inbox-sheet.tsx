'use client'

import * as React from 'react'
import { Bell } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { ScrollArea } from '@workspace/ui/components/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet'
import { cn } from '@workspace/ui/lib/utils'

type InboxCategory = 'inventory' | 'order' | 'shop' | 'sourcing' | 'finance' | 'system'

type InboxMessage = {
  id: string
  category: InboxCategory
  /** i18n key under SiteMessages.mock.* */
  mockKey: 'inv1' | 'ord1' | 'shop1' | 'src1' | 'fin1' | 'sys1'
  read: boolean
  /** Minutes ago from "now" for stable relative-looking mock times */
  minutesAgo: number
}

const INITIAL_MESSAGES: InboxMessage[] = [
  { id: 'inv1', category: 'inventory', mockKey: 'inv1', read: false, minutesAgo: 25 },
  { id: 'ord1', category: 'order', mockKey: 'ord1', read: false, minutesAgo: 90 },
  { id: 'shop1', category: 'shop', mockKey: 'shop1', read: false, minutesAgo: 60 * 5 },
  { id: 'src1', category: 'sourcing', mockKey: 'src1', read: true, minutesAgo: 60 * 26 },
  { id: 'fin1', category: 'finance', mockKey: 'fin1', read: true, minutesAgo: 60 * 50 },
  { id: 'sys1', category: 'system', mockKey: 'sys1', read: true, minutesAgo: 60 * 80 },
]

function formatRelativeTime(minutesAgo: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en', {
    numeric: 'auto',
  })
  if (minutesAgo < 60) return rtf.format(-Math.max(1, minutesAgo), 'minute')
  const hours = Math.round(minutesAgo / 60)
  if (hours < 48) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

/**
 * Console topbar inbox: Bell opens a right Sheet (overlay drawer).
 * Separate from the Copilot layout column — both can be open together.
 */
export function ConsoleInboxSheet() {
  const t = useTranslations('SiteMessages')
  const tc = useTranslations('Common')
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<InboxMessage[]>(INITIAL_MESSAGES)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const locale = useLocale()
  const unreadCount = messages.filter((m) => !m.read).length
  const selected = messages.find((m) => m.id === selectedId) ?? null

  function markRead(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))
  }

  function markAllRead() {
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })))
  }

  function openDetail(id: string) {
    markRead(id)
    setSelectedId(id)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={tc('notifications')}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span
              className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] leading-none font-medium text-destructive-foreground"
              aria-label={t('unreadBadge', { count: unreadCount })}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>

        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border pr-12">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <SheetTitle>{t('title')}</SheetTitle>
                <SheetDescription>{t('mockHint')}</SheetDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                disabled={unreadCount === 0}
                onClick={markAllRead}
              >
                {t('markAllRead')}
              </Button>
            </div>
            {unreadCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('unreadBadge', { count: unreadCount })}
              </p>
            ) : null}
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <ul className="flex flex-col gap-1 p-3">
              {messages.length === 0 ? (
                <li className="py-10 text-center text-sm text-muted-foreground">
                  {t('noMessages')}
                </li>
              ) : (
                messages.map((msg) => {
                  const title = t(`mock.${msg.mockKey}.title`)
                  const summary = t(`mock.${msg.mockKey}.summary`)
                  return (
                    <li key={msg.id}>
                      <button
                        type="button"
                        className={cn(
                          'hover:bg-muted/60 flex w-full flex-col gap-1.5 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors',
                          !msg.read && 'bg-muted/40 border-border/60',
                        )}
                        onClick={() => openDetail(msg.id)}
                      >
                        <div className="flex items-center gap-2">
                          {!msg.read ? (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-primary"
                              aria-hidden
                            />
                          ) : (
                            <span className="size-1.5 shrink-0" aria-hidden />
                          )}
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {t(`categories.${msg.category}`)}
                          </Badge>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {formatRelativeTime(msg.minutesAgo, locale)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            'line-clamp-1 text-sm',
                            !msg.read ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                          )}
                        >
                          {title}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{summary}</p>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog
        open={selected != null}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null)
        }}
      >
        <DialogContent className="max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-6">
                  <Badge variant="secondary">{t(`categories.${selected.category}`)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(selected.minutesAgo, locale)}
                  </span>
                </div>
                <DialogTitle className="text-left">
                  {t(`mock.${selected.mockKey}.title`)}
                </DialogTitle>
                <DialogDescription className="text-left">
                  {t(`mock.${selected.mockKey}.summary`)}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {t(`mock.${selected.mockKey}.content`)}
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setSelectedId(null)}>
                  {t('back')}
                </Button>
                {!selected.read ? (
                  <Button type="button" onClick={() => markRead(selected.id)}>
                    {t('markRead')}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
