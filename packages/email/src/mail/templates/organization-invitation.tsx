import EmailButton from '../components/email-button'
import EmailLayout from '../components/email-layout'
import { previewDefaultLocale, previewMessages } from '../preview-messages'
import type { BaseEmailProps } from '../types'
import { Text } from '@react-email/components'
import { createTranslator } from 'use-intl/core'

interface OrganizationInvitationProps extends BaseEmailProps {
  url: string
  email: string
  name: string
  organizationName: string
  invitedByName: string
  invitedByEmail?: string
}

export function OrganizationInvitation({
  url,
  email,
  name,
  organizationName,
  invitedByName,
  invitedByEmail,
  locale,
  messages,
}: OrganizationInvitationProps) {
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Mail.organizationInvitation',
  })

  return (
    <EmailLayout locale={locale} messages={messages}>
      <Text>{t('title', { name: name || email })}</Text>
      <Text>
        {t('body', {
          invitedByName,
          organizationName,
          invitedByEmail: invitedByEmail || '',
        })}
      </Text>
      <Text>{t('passwordHint')}</Text>
      <EmailButton href={url}>{t('accept')}</EmailButton>
      <Text>{t('relogin')}</Text>
    </EmailLayout>
  )
}

OrganizationInvitation.PreviewProps = {
  locale: previewDefaultLocale,
  messages: previewMessages,
  url: 'https://example.com/zh/auth/accept-invite?id=demo',
  email: 'invitee@example.com',
  name: '新成员',
  organizationName: '示例组织',
  invitedByName: '管理员',
  invitedByEmail: 'admin@example.com',
}

export default OrganizationInvitation
