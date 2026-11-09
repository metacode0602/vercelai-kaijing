import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { getTranslations } from 'next-intl/server'

/**
 * 无访问权限：会话存在但不是平台管理员（web_auth 平台组织成员）时的落点。
 * 由 (protected)/layout 重定向至此；放在此分组外，避免登录页与受保护页互相踢。
 */
export default async function ForbiddenPage() {
  const t = await getTranslations('ForbiddenPage')

  return (
    <main className='flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center'>
      <h1 className='text-3xl font-bold'>{t('title')}</h1>
      <p className='text-balance max-w-md text-muted-foreground'>{t('message')}</p>
      <Button asChild size='lg'>
        <LocaleLink href='/signin'>{t('backToSignin')}</LocaleLink>
      </Button>
    </main>
  )
}
