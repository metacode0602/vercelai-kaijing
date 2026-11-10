export const websiteConfig = {
  metadata: {
    title: 'GPURun Cloud | GPURun',
    description: 'GPU Cloud Platform',
    mode: {
      defaultMode: 'system' as const,
    },
  },
  i18n: {
    defaultLocale: 'zh',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
      },
      zh: {
        flag: '🇨🇳',
        name: '中文',
      },
    },
  },
  routes: {
    defaultLoginRedirect: '/console/dashboard',
  },
  auth: {
    enableEmailVerification: true,
    requireEmailVerification: false,
    emailSuffix: 'rungpu.cn',
    cookieDomain: '',
    cookiePrefix: 'shop',
    trustedOrigins:
      process.env.NODE_ENV === 'production'
        ? ['https://shop.rungpu.cn']
        : [process.env.NEXT_PUBLIC_URL].filter((v): v is string => Boolean(v)),
  },
  mail: {
    provider: 'nodemailer' as const,
    fromEmail: 'GPURun Cloud <service@gpurun.cn>',
    supportEmail: 'GPURun Cloud <service@gpurun.cn>',
  },
} as const
