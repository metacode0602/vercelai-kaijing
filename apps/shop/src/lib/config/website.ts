export const websiteConfig = {
  metadata: {
    title: 'Open Shop | 跨境电商 AI 运营中枢',
    description:
      'Open Shop 把商品、订单、库存、成本、财务与审批沉淀为唯一事实源；OpenMCP Station 桌面工作台在此之上完成发现、解释、建议与自动化。',
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
