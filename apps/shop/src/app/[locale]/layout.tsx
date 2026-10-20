import '@workspace/ui/globals.css'
import '@/app/globals.css'
import { Analytics } from '@workspace/shared-next/analytics'
import { fontBricolageGrotesque, fontNotoSans, fontNotoSerif } from '@workspace/shared-next/assets/fonts'
import { routing } from '@/lib/i18n/routing'
import { cn } from '@workspace/ui/lib/utils'
import { type Locale, NextIntlClientProvider, hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { Providers } from './providers'

import { Toaster } from 'sonner'

interface LocaleLayoutProps {
  children: ReactNode
  params: Promise<{ locale: Locale }>
}

export async function generateMetadata({ params }: LocaleLayoutProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })

  return {
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/logo/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/logo/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/logo/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
        {
          url: '/logo/icon-light-32x32.png',
          sizes: '32x32',
          type: 'image/png',
          media: '(prefers-color-scheme: light)',
        },
        {
          url: '/logo/icon-dark-32x32.png',
          sizes: '32x32',
          type: 'image/png',
          media: '(prefers-color-scheme: dark)',
        },
        { url: '/logo/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/logo/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
      other: [
        {
          rel: 'apple-touch-icon-precomposed',
          url: '/logo/apple-touch-icon.png',
          sizes: '180x180',
        },
      ],
    },
    other: {
      'msapplication-TileColor': '#20A04E',
      'msapplication-TileImage': '/logo/mstile-150x150.png',
    },
  }
}

export const viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  let { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale
  }

  return (
    <html
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      suppressHydrationWarning
      className={cn(
        fontBricolageGrotesque.variable,
        fontNotoSans.variable,
        fontNotoSerif.variable,
        'bg-background',
      )}
    >
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          <Providers>
            {children}
            <Toaster richColors position='top-right' offset={64} />

            <Analytics />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
