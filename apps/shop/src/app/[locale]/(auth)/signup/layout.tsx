import { constructMetadata } from '@/lib/seo/metadata'
import { getUrlWithLocale } from '@/lib/utils/urls'
import type { Metadata } from 'next'
import type { Locale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { ReactNode } from 'react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata | undefined> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  const pt = await getTranslations({ locale, namespace: 'AuthPage.register' })

  return constructMetadata({
    title: pt('title') + ' | ' + t('title'),
    description: pt('description'),
    canonicalUrl: getUrlWithLocale('/signup', locale),
  })
}

interface SignupLayoutProps {
  children: ReactNode
}

export default function SignupLayout({ children }: SignupLayoutProps) {
  return children
}
