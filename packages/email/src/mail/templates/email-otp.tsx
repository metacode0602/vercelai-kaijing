import EmailLayout from '../components/email-layout'
import { previewDefaultLocale, previewMessages } from '../preview-messages'
import type { BaseEmailProps } from '../types'
import { Text } from '@react-email/components'
import { createTranslator } from 'use-intl/core'

export type EmailOtpPurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'

interface EmailOtpProps extends BaseEmailProps {
  code: string
  name?: string
  purpose: EmailOtpPurpose
}

export function EmailOtp({ code, name, purpose, locale, messages }: EmailOtpProps) {
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Mail.emailOtp',
  })

  return (
    <EmailLayout locale={locale} messages={messages}>
      <Text>{t('greeting', { name: name || t('anonymous') })}</Text>
      <Text>{t(`action.${purpose}`)}</Text>
      <Text>{t('code', { code })}</Text>
      <Text>{t('expires')}</Text>
      <Text>{t('ignore')}</Text>
    </EmailLayout>
  )
}

EmailOtp.PreviewProps = {
  locale: previewDefaultLocale,
  messages: previewMessages,
  code: '123456',
  name: 'username',
  purpose: 'sign-in',
}

export default EmailOtp
