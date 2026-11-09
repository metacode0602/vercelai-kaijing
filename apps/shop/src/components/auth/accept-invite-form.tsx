'use client'

import * as React from 'react'
import { AuthCard } from '@/components/auth/auth-card'
import { FormError } from '@/components/auth/form-error'
import { FormSuccess } from '@/components/auth/form-success'
import { Button } from '@workspace/ui/components/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Routes } from '@/lib/routes'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@workspace/ui/lib/utils'
import { Loader2Icon } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

export function AcceptInviteForm({ className }: { className?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id') ?? ''
  const inviteQuery = trpc.members.getInvitationPublic.useQuery({ id }, { enabled: Boolean(id) })
  const acceptMutation = trpc.members.acceptInvitationWithPassword.useMutation()

  const [name, setName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [success, setSuccess] = React.useState('')

  const invite = inviteQuery.data

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!id) {
      setError('邀请链接无效')
      return
    }
    if (password.length < 8) {
      setError('密码至少 8 位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    try {
      const res = await acceptMutation.mutateAsync({ id, password, name: name.trim() || undefined })
      setSuccess(res.note)
      setTimeout(() => {
        router.push(`${Routes.Login}?notice=${encodeURIComponent('请重新登录以进入组织')}`)
      }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '接受邀请失败')
    }
  }

  if (!id) {
    return (
      <AuthCard headerLabel="接受邀请" description="链接缺少邀请编号" className={cn('w-full', className)}>
        <FormError message="请使用邮件中的完整邀请链接。" />
        <LocaleLink href={Routes.Login} className="text-sm text-primary underline">
          返回登录
        </LocaleLink>
      </AuthCard>
    )
  }

  if (inviteQuery.isLoading) {
    return (
      <AuthCard headerLabel="接受邀请" description="正在校验邀请…" className={cn('w-full', className)}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> 加载中
        </p>
      </AuthCard>
    )
  }

  if (inviteQuery.isError || !invite) {
    return (
      <AuthCard headerLabel="接受邀请" description="无法打开邀请" className={cn('w-full', className)}>
        <FormError message={inviteQuery.error?.message || '邀请不存在或链接无效'} />
        <LocaleLink href={Routes.Login} className="text-sm text-primary underline">
          返回登录
        </LocaleLink>
      </AuthCard>
    )
  }

  if (!invite.canAccept) {
    return (
      <AuthCard
        headerLabel="接受邀请"
        description={invite.organizationName}
        className={cn('w-full', className)}
      >
        <FormError
          message={
            invite.status === 'accepted'
              ? '该邀请已接受，请直接登录。'
              : invite.status === 'expired'
                ? '邀请已过期，请联系管理员重新发送。'
                : `当前状态为 ${invite.status}，无法接受。`
          }
        />
        <LocaleLink href={Routes.Login} className="text-sm text-primary underline">
          前往登录
        </LocaleLink>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      headerLabel="接受组织邀请"
      description={`加入「${invite.organizationName}」并设置登录密码`}
      className={cn('w-full', className)}
    >
      <form onSubmit={onSubmit} className="space-y-6 pb-2">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>邮箱</FieldLabel>
            <Input value={invite.email || ''} readOnly />
          </Field>
          {invite.phone ? (
            <Field>
              <FieldLabel>手机号</FieldLabel>
              <Input value={invite.phone} readOnly />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="invite-name">姓名（可选）</FieldLabel>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="显示名称" />
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-password">登录密码</FieldLabel>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <FieldError>至少 8 位</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-confirm">确认密码</FieldLabel>
            <Input
              id="invite-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
        </FieldGroup>
        <FormError message={error} />
        <FormSuccess message={success} />
        <Button type="submit" className="w-full" disabled={acceptMutation.isPending}>
          {acceptMutation.isPending ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" /> 处理中…
            </>
          ) : (
            '接受邀请并设置密码'
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">设置完成后需重新登录，当前不会保持会话。</p>
      </form>
    </AuthCard>
  )
}
