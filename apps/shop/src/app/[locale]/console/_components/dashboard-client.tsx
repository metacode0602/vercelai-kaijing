'use client'

import { useStore } from '@/components/console-store'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowUpRight,
  Cpu,
  CpuIcon,
  CreditCard,
  FlaskConical,
  HardDrive,
  LayoutGrid,
  ListChecks,
  Plus,
  Radio,
  Server,
  Wallet,
  Zap,
} from 'lucide-react'
import { cn } from '@workspace/ui/lib/utils'

interface DashboardClientProps {
  userName: string | null
}

export function DashboardClient({ userName }: DashboardClientProps) {
  const t = useTranslations('Console.dashboard')
  const ct = useTranslations('Console')
  const bt = useTranslations('Common.balance')

  const { serverInstances, metalInstances, volumes } = useStore()

  const runningServers = serverInstances.filter((i) => i.status === 'running').length
  const runningMetal = metalInstances.filter((i) => i.status === 'running').length
  const totalRunning = runningServers + runningMetal
  const totalVolumes = volumes.length

  // 模拟账户数据；接入 API 后替换为真实数据
  const displayBalance = 0

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-5 py-6">
      {/* 欢迎区域 */}
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          {userName ? t('greeting', { name: userName }) : t('greetingDefault')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </section>

      {/* 概览指标卡片 */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('stats.balance')}
            </CardTitle>
            <Wallet className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-emerald-600">
              ${displayBalance.toFixed(2)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{bt('availableCredit')}</p>
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
            <LocaleLink
              href="/recharge"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {bt('recharge')}
              <ArrowUpRight className="size-3" />
            </LocaleLink>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('stats.runningInstances')}
            </CardTitle>
            <Server className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalRunning}</div>
            <div className="mt-0.5 flex items-center gap-2">
              {runningServers > 0 && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {t('stats.serverCount', { count: runningServers })}
                </Badge>
              )}
              {runningMetal > 0 && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {t('stats.metalCount', { count: runningMetal })}
                </Badge>
              )}
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
            <LocaleLink
              href="/console/server/instances"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t('stats.viewInstances')}
              <ArrowUpRight className="size-3" />
            </LocaleLink>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('stats.volumes')}
            </CardTitle>
            <HardDrive className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalVolumes}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('stats.volumesHint')}</p>
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
            <LocaleLink
              href="/storage"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t('stats.manageVolumes')}
              <ArrowUpRight className="size-3" />
            </LocaleLink>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('stats.quickActions')}
            </CardTitle>
            <Zap className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <LocaleLink href="/console/server/list">
                <Plus className="size-3.5" />
                {t('actions.deployInstance')}
              </LocaleLink>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <LocaleLink href="/console/serverless/deploy">
                <Radio className="size-3.5" />
                {t('actions.deployServerless')}
              </LocaleLink>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* 快捷入口 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('quickLinks')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLinkCard
            href="/apps"
            icon={<LayoutGrid className="size-5" />}
            label={ct('nav.apps')}
            description={t('links.appsDesc')}
          />
          <QuickLinkCard
            href="/console/server/list"
            icon={<Cpu className="size-5" />}
            label={ct('nav.deployInstance')}
            description={t('links.instanceDesc')}
          />
          <QuickLinkCard
            href="/console/serverless/deploy"
            icon={<Radio className="size-5" />}
            label={ct('nav.deployServerless')}
            description={t('links.serverlessDesc')}
          />
          <QuickLinkCard
            href="/console/metal/list"
            icon={<CpuIcon className="size-5" />}
            label={ct('nav.deployMetal')}
            description={t('links.metalDesc')}
          />
          <QuickLinkCard
            href="/console/billing"
            icon={<CreditCard className="size-5" />}
            label={ct('nav.billing')}
            description={t('links.billingDesc')}
          />
          <QuickLinkCard
            href="/console/tasks"
            icon={<ListChecks className="size-5" />}
            label={ct('nav.tasks')}
            description={t('links.tasksDesc')}
          />
        </div>
      </section>

      {/* 快速部署应用 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('appTemplates')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AppTemplateCard
            name="ComfyUI"
            description={t('templates.comfyuiDesc')}
            href="/console/apps"
            icon={<FlaskConical className="size-5" />}
          />
          <AppTemplateCard
            name="vLLM"
            description={t('templates.vllmDesc')}
            href="/console/apps"
            icon={<Zap className="size-5" />}
          />
          <AppTemplateCard
            name="PyTorch"
            description={t('templates.pytorchDesc')}
            href="/console/server/list"
            icon={<Cpu className="size-5" />}
          />
          <AppTemplateCard
            name="Jupyter"
            description={t('templates.jupyterDesc')}
            href="/console/server/list"
            icon={<FlaskConical className="size-5" />}
          />
        </div>
      </section>
    </div>
  )
}

function QuickLinkCard({
  href,
  icon,
  label,
  description,
}: {
  href: string
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <LocaleLink href={href} className="block">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <CardDescription className="mt-0.5 text-xs leading-relaxed">
              {description}
            </CardDescription>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40" />
        </CardHeader>
      </Card>
    </LocaleLink>
  )
}

function AppTemplateCard({
  name,
  description,
  href,
  icon,
}: {
  name: string
  description: string
  href: string
  icon: React.ReactNode
}) {
  return (
    <LocaleLink href={href} className="block">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-col items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground">
            {icon}
          </div>
          <div>
            <CardTitle className="text-sm font-medium">{name}</CardTitle>
            <CardDescription className="mt-0.5 text-xs leading-relaxed">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </LocaleLink>
  )
}
