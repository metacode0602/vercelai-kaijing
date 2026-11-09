'use client'

import * as React from 'react'
import { MessageSquare, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { cn } from '@workspace/ui/lib/utils'
import { LocaleLink, useLocalePathname, useLocaleRouter } from '@/lib/i18n/navigation'
import { useConsoleCopilot } from '@/components/console/console-copilot-provider'
import {
  dispatchCostCalcAction,
  matchCostRecalculatePath,
  writePendingCostCalcActions,
  type CostCalcBridgeAction,
} from '@/lib/crossborder/cost-calculator-bridge'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = ['日报', '库存分析', '利润分析', '选品建议'] as const

/**
 * Apply cost-calc actions on the recalculate page, or navigate there first.
 * Never opens the right Sheet / entry Dialog.
 */
function runCostCalcOnPageOrNavigate(
  actions: CostCalcBridgeAction[],
  opts: { pathname: string | null; router: { push: (href: string) => void }; fallbackSku?: string },
) {
  const skuFromAction =
    actions.find(
      (a): a is Extract<CostCalcBridgeAction, { type: 'open' | 'apply_sku' }> =>
        a.type === 'open' || a.type === 'apply_sku',
    )?.sku ?? opts.fallbackSku ?? 'TEE-001'

  const onRecalc = matchCostRecalculatePath(opts.pathname)
  if (onRecalc) {
    for (const action of actions) {
      dispatchCostCalcAction(action, 'copilot')
    }
    return
  }

  writePendingCostCalcActions(actions)
  opts.router.push(`/console/costs/${skuFromAction}/recalculate`)
}

const PANEL_WIDTH = 'w-[min(100%,380px)]'

/**
 * 尚未接入模型服务时的兜底回复：只陈述现状，不编造业务数字。
 * 接入真实 AI 网关后，改为在 send 流程内调用后端并回填模型输出。
 */
const MODEL_NOT_CONNECTED_REPLY =
  '当前环境未接入模型服务，暂时无法回答该问题。日报、库存、利润、选品请到对应控制台页面查看；下方成本测算快捷指令可直接执行。'

const COST_SUGGESTION_REPLIES = [
  '已打开成本计算器并套用 TEE-001 预设：FOB 4.2 USD、服装税率档、LCL。右侧瀑布会展示 Customs→PAL→CESS→VAT→SSCL 与到仓/件。数字为估算，需报关 / 法务复核。',
  '已切换海运模式以便对比。结果区「LCL vs FCL」表会标出当前批量更优方案，并提示约多少件后 FCL 20\' 可能更划算（估算）。',
  '已将目标净利率设为 20%，并按 P* = (landed + 尾程) / (1 − 佣金 − 支付 − m) 重算建议售价。详见工作台「计算规则与公式」。',
] as const

/**
 * Right-hand console layout column. Renders nothing when closed so main content
 * keeps full width. Open/close is controlled via ConsoleCopilotProvider + topbar.
 */
export function ConsoleCopilot() {
  const t = useTranslations('Console.copilot')
  const { open, setOpen } = useConsoleCopilot()
  const pathname = useLocalePathname()
  const router = useLocaleRouter()
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: t('welcome'),
    },
  ])
  const listRef = React.useRef<HTMLDivElement>(null)

  const navOpts = React.useMemo(
    () => ({ pathname, router }),
    [pathname, router],
  )

  const costSuggestions = React.useMemo(
    () =>
      [
        {
          label: '按当前 SKU 测算到仓成本',
          user: '按当前 SKU 测算到仓成本',
          reply: COST_SUGGESTION_REPLIES[0],
          run: () =>
            runCostCalcOnPageOrNavigate(
              [{ type: 'open', sku: 'TEE-001' }, { type: 'compute' }],
              { ...navOpts, fallbackSku: 'TEE-001' },
            ),
        },
        {
          label: '对比拼柜与整柜',
          user: '对比拼柜与整柜',
          reply: COST_SUGGESTION_REPLIES[1],
          run: () =>
            runCostCalcOnPageOrNavigate(
              [
                { type: 'open', sku: 'TEE-001' },
                { type: 'compare_lcl_fcl' },
              ],
              { ...navOpts, fallbackSku: 'TEE-001' },
            ),
        },
        {
          label: '按 20% 净利率给建议售价',
          user: '按 20% 净利率给建议售价',
          reply: COST_SUGGESTION_REPLIES[2],
          run: () =>
            runCostCalcOnPageOrNavigate(
              [
                { type: 'open', sku: 'TEE-001' },
                { type: 'set_margin', pct: 20 },
              ],
              { ...navOpts, fallbackSku: 'TEE-001' },
            ),
        },
      ] as const,
    [navOpts],
  )

  React.useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  function maybeRunCostAction(text: string) {
    const lower = text.toLowerCase()
    if (
      lower.includes('到仓') ||
      lower.includes('成本测算') ||
      lower.includes('成本计算') ||
      lower.includes('landed') ||
      text.includes('按当前 SKU')
    ) {
      costSuggestions[0].run()
      return
    }
    if (lower.includes('拼柜') || lower.includes('整柜') || lower.includes('lcl') || lower.includes('fcl')) {
      costSuggestions[1].run()
      return
    }
    if (lower.includes('净利率') || lower.includes('建议售价') || text.includes('20%')) {
      costSuggestions[2].run()
    }
  }

  function send(text: string, replyOverride?: string, opts?: { skipCostAction?: boolean }) {
    const trimmed = text.trim()
    if (!trimmed) return
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed }
    const botMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: replyOverride ?? MODEL_NOT_CONNECTED_REPLY,
    }
    setMessages((prev) => [...prev, userMsg, botMsg])
    setInput('')
    if (!opts?.skipCostAction) maybeRunCostAction(trimmed)
  }

  if (!open) return null

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-svh shrink-0 flex-col border-l bg-background',
        PANEL_WIDTH,
      )}
      aria-label={t('title')}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <MessageSquare className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t('title')}</p>
          <p className="truncate text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setOpen(false)}
          aria-label={t('close')}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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

      <div className="shrink-0 space-y-2 border-t p-3">
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
        <p className="text-[10px] font-medium text-muted-foreground">成本测算</p>
        <div className="flex flex-wrap gap-1.5">
          {costSuggestions.map((s) => (
            <Button
              key={s.label}
              type="button"
              size="sm"
              variant="outline"
              className="h-auto max-w-full whitespace-normal px-2 py-1 text-left text-[11px] leading-snug"
              onClick={() => {
                s.run()
                send(s.user, s.reply, { skipCostAction: true })
              }}
            >
              {s.label}
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
  )
}
