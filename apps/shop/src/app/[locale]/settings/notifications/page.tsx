'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Switch } from '@workspace/ui/components/switch'

export default function SettingsNotificationsPage() {
  const utils = trpc.useUtils()
  const query = trpc.organization.getNotificationSettings.useQuery()
  const [enabledOverride, setEnabledOverride] = React.useState<boolean | null>(null)
  const [webhookUrl, setWebhookUrl] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [noticeError, setNoticeError] = React.useState(false)
  const enabled = enabledOverride ?? query.data?.dingtalkEnabled ?? false

  const saveMutation = trpc.organization.updateNotificationSettings.useMutation({
    onSuccess: async (data) => {
      await utils.organization.getNotificationSettings.invalidate()
      setEnabledOverride(null)
      setWebhookUrl('')
      setNoticeError(false)
      setNotice(
        data.dingtalkEnabled
          ? '钉钉通知已保存并启用。订单异常、同步失败与新触发的库存预警会尝试发送。'
          : '钉钉通知配置已保存（当前未启用）。',
      )
    },
    onError: (error) => {
      setNoticeError(true)
      setNotice(error.message)
    },
  })

  const testMutation = trpc.organization.sendDingTalkTest.useMutation({
    onSuccess: (data) => {
      setNoticeError(false)
      setNotice(
        data.message + (webhookUrl.trim() && !query.data?.webhookConfigured ? ' 若要在事件通知中使用，请先保存。' : ''),
      )
    },
    onError: (error) => {
      setNoticeError(true)
      setNotice(error.message)
    },
  })

  function handleSave() {
    saveMutation.mutate({
      dingtalkEnabled: enabled,
      webhookUrl: webhookUrl.trim() || undefined,
    })
  }

  function handleTest() {
    testMutation.mutate({
      webhookUrl: webhookUrl.trim() || undefined,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">通知 / 钉钉</h2>
        <p className="text-sm text-muted-foreground">
          保存自定义机器人 Webhook 后可发送测试消息；启用后会在新的订单异常/同步失败站内信以及新触发的库存预警时尝试推送。本页不含其他未接线渠道。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">钉钉机器人</CardTitle>
          <CardDescription>
            Webhook 属于组织密钥，列表与回读只显示脱敏地址。发送失败时不会显示为成功。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isLoading ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
          {query.isError ? (
            <p className="text-sm text-destructive">{query.error.message}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="dingtalk">启用钉钉通知</Label>
            <Switch id="dingtalk" checked={enabled} onCheckedChange={setEnabledOverride} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook">Webhook 地址</Label>
            <Input
              id="webhook"
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
              autoComplete="off"
            />
            {query.data?.webhookMasked ? (
              <p className="text-xs text-muted-foreground">当前已保存：{query.data.webhookMasked}。留空保存则保留原地址。</p>
            ) : (
              <p className="text-xs text-muted-foreground">仅接受 https://oapi.dingtalk.com 或 https://api.dingtalk.com 的自定义机器人地址。</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || query.isLoading}>
              {saveMutation.isPending ? '保存中…' : '保存'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending || query.isLoading}
            >
              {testMutation.isPending ? '发送中…' : '发送测试'}
            </Button>
          </div>
          {notice ? (
            <p role="status" className={`text-sm ${noticeError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {notice}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
