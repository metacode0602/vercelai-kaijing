'use client'

import * as React from 'react'
import { MessageSquare, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { cn } from '@workspace/ui/lib/utils'
import { LocaleLink } from '@/lib/i18n/navigation'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = ['日报', '库存分析', '利润分析', '选品建议'] as const

function mockReply(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('库存') || lower.includes('inventory')) {
    return '（示例）TEE-001 与 MAT-02 低于阈值；可前往库存预警查看补货建议，敏感改价请走待审队列。'
  }
  if (lower.includes('利润') || lower.includes('财务') || lower.includes('profit')) {
    return '（示例）近 7 天 Daraz 净利润约 4,720 USD（示例数据）。详见财务中心。'
  }
  if (lower.includes('选品') || lower.includes('候选')) {
    return '（示例）当前高分候选：Oversized Cotton Tee（0.91）。接受上架会进入待审。'
  }
  if (lower.includes('日报') || lower.includes('报告')) {
    return '（示例）今日：订单 186、待审 2、库存告警 2。建议优先处理待审刊登。'
  }
  return '（示例 · mock）我是运营助手（AI-C）。可问日报、库存、利润或选品。需执行的动作请到待审队列确认。'
}

export function ConsoleCopilot() {
  const t = useTranslations('Console.copilot')
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: t('welcome'),
    },
  ])
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed }
    const botMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: mockReply(trimmed),
    }
    setMessages((prev) => [...prev, userMsg, botMsg])
    setInput('')
  }

  return (
    <>
      {!open ? (
        <Button
          type="button"
          size="icon"
          className="fixed right-5 bottom-5 z-40 size-12 rounded-full shadow-lg"
          onClick={() => setOpen(true)}
          aria-label={t('open')}
        >
          <Sparkles className="size-5" />
        </Button>
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l bg-background shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <MessageSquare className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t('title')}</p>
            <p className="truncate text-xs text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'ml-auto bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              {m.content}
              {m.role === 'assistant' && m.content.includes('待审') ? (
                <div className="mt-2">
                  <LocaleLink href="/console/pending" className="text-xs underline underline-offset-2">
                    {t('goPending')}
                  </LocaleLink>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t p-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => send(p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('placeholder')}
              className="flex-1"
            />
            <Button type="submit" size="sm">
              {t('send')}
            </Button>
          </form>
        </div>
      </aside>
    </>
  )
}
