import { RegisterForm } from '@/components/auth/register-form'
import { requireUnauth } from '@/components/features/auth/lib/utils'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Routes } from '@/lib/routes'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export const metadata: Metadata = {
  title: '注册 - 创建新账号',
  description: '创建账号以开始使用',
}

export default async function RegisterPage() {
  await requireUnauth(Routes.Dashboard)
  const common = await getTranslations('AuthPage.common')

  return (
    <main className="flex w-full max-w-md flex-col gap-6 px-4 py-6 sm:px-6">
      <RegisterForm />

      <p className="text-balance text-center text-xs leading-relaxed text-muted-foreground">
        {common('byClickingContinue')}
        <LocaleLink
          href={Routes.TermsOfService}
          className="underline underline-offset-4 hover:text-primary"
        >
          {common('termsOfService')}
        </LocaleLink>{' '}
        {common('and')}{' '}
        <LocaleLink
          href={Routes.PrivacyPolicy}
          className="underline underline-offset-4 hover:text-primary"
        >
          {common('privacyPolicy')}
        </LocaleLink>
      </p>
    </main>
  )
}
