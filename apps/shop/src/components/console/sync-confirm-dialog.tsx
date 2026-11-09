'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'

/**
 * 同步 / 提交 / 重试入口的确认对话框。
 * 复用 UedDialog 视觉风格（遮罩 / 圆角 / header-footer），但无表单字段，
 * 仅展示「作用范围 + 影响 + 平台调用」三段文案，让用户在执行前明确知晓后果。
 *
 * @see docs/design/console-sync-confirm-dialog.md §4
 */
export interface SyncConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** 一句话说明做什么 */
  description: string
  /** 作用范围：明确告知哪个店铺 / 哪些店铺 / 哪个批次 */
  scope: {
    label: string
    value: string
  }
  /** 影响条目（每条一行，建议 ≤ 4 条） */
  impacts: string[]
  /** 平台调用说明；undefined 表示不调平台（本地操作或 stub） */
  platformCall?: {
    label: string
    detail: string
  }
  confirmLabel?: string
  cancelLabel?: string
  /** 确认按钮 loading 态（跟随 mutation.isPending） */
  pending?: boolean
  /** 不可逆操作用 destructive 样式 */
  destructive?: boolean
  onConfirm: () => void
}

export function SyncConfirmDialog(props: SyncConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    scope,
    impacts,
    platformCall,
    confirmLabel = '确认',
    cancelLabel = '取消',
    pending = false,
    destructive = false,
    onConfirm,
  } = props

  // 关闭时若正在 pending，则不允许通过遮罩 / Esc 关闭，避免误触取消执行中的请求
  const handleMaskClose = React.useCallback(() => {
    if (pending) return
    onOpenChange(false)
  }, [pending, onOpenChange])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onOpenChange(false)
    },
    [pending, onOpenChange],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleMaskClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-confirm-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
      >
        <header className="border-b p-5">
          <h2 id="sync-confirm-title" className="font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {/* 作用范围 */}
          <div className="flex items-baseline justify-between gap-4 border-b pb-3">
            <span className="text-sm text-muted-foreground">{scope.label}</span>
            <span className="text-right text-sm font-medium">{scope.value}</span>
          </div>

          {/* 影响条目 */}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">影响</p>
            <ul className="flex flex-col gap-1.5">
              {impacts.map((impact, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm leading-relaxed"
                >
                  <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span>{impact}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 平台调用说明（仅当真实调平台时显示） */}
          {platformCall ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2.5">
              <p className="text-sm font-medium">{platformCall.label}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {platformCall.detail}
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            <Check data-icon="inline-start" />
            {pending ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  )
}

/**
 * 把店铺列表格式化为 scope.value 字符串。
 * - N=0：'暂无激活店铺'
 * - N≤5：'全部 N 家店铺：A、B、C'
 * - N>5：'全部 N 家店铺（A、B 等 N 家）'
 */
export function formatShopScope(
  shops: Array<{ name: string; platform?: string; region?: string | null }>,
): string {
  if (shops.length === 0) return '暂无激活店铺'
  if (shops.length <= 5) {
    return `全部 ${shops.length} 家店铺：${shops.map((s) => s.name).join('、')}`
  }
  return `全部 ${shops.length} 家店铺（${shops
    .slice(0, 2)
    .map((s) => s.name)
    .join('、')} 等 ${shops.length} 家）`
}

/**
 * 单店铺格式化：`{平台} {站点} · {店铺名}`，平台 / 站点缺失时降级显示。
 */
export function formatSingleShop(shop: {
  name: string
  platform?: string
  region?: string | null
}): string {
  const parts: string[] = []
  if (shop.platform) parts.push(shop.platform.toUpperCase())
  if (shop.region) parts.push(shop.region.toUpperCase())
  parts.push(shop.name)
  return parts.join(' · ')
}
