'use client'

import * as React from 'react'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { DetailPageHeader } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import { OPENSHOP_READ_SCOPE, OPENSHOP_WRITE_PENDING_SCOPE } from '@workspace/auth'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Switch } from '@workspace/ui/components/switch'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { useTranslations } from 'next-intl'

const PAGE_SIZE = 20

export default function McpAccessSettingsPage() {
  const t = useTranslations('SettingsMcpAccess')
  const utils = trpc.useUtils()
  const statusQuery = trpc.mcpAccess.status.useQuery()
  const [keyPage, setKeyPage] = React.useState(1)
  const [clientPage, setClientPage] = React.useState(1)
  const keysQuery = trpc.mcpAccess.listApiKeys.useQuery({ page: keyPage, pageSize: PAGE_SIZE })
  const clientsQuery = trpc.mcpAccess.listClients.useQuery({ page: clientPage, pageSize: PAGE_SIZE })
  const [notice, setNotice] = React.useState('')
  const [keyName, setKeyName] = React.useState('')
  const [keyScopes, setKeyScopes] = React.useState<Array<typeof OPENSHOP_READ_SCOPE | typeof OPENSHOP_WRITE_PENDING_SCOPE>>([OPENSHOP_READ_SCOPE])
  const [clientName, setClientName] = React.useState('')
  const [redirectUris, setRedirectUris] = React.useState('')
  const [confidential, setConfidential] = React.useState(false)
  const [applicationType, setApplicationType] = React.useState<'web' | 'native'>('native')
  const [revealedSecret, setRevealedSecret] = React.useState<string>()
  const [confirm, setConfirm] = React.useState<
    | { type: 'key'; id: string; name: string }
    | { type: 'client'; id: string; name: string }
    | null
  >(null)

  const setEnabled = trpc.mcpAccess.setOrganizationEnabled.useMutation({
    onSuccess: async () => {
      setNotice(t('saved'))
      await utils.mcpAccess.status.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const createKey = trpc.mcpAccess.createApiKey.useMutation({
    onSuccess: async (result) => {
      setRevealedSecret(result.plaintext)
      setKeyName('')
      setNotice(t('keyCreated'))
      await utils.mcpAccess.listApiKeys.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const disableKey = trpc.mcpAccess.disableApiKey.useMutation({
    onSuccess: async () => {
      setNotice(t('keyDisabled'))
      setConfirm(null)
      await utils.mcpAccess.listApiKeys.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const createClient = trpc.mcpAccess.createClient.useMutation({
    onSuccess: async (result) => {
      setRevealedSecret(
        result.clientSecret
          ? `${t('clientIdLabel')}: ${result.clientId}\n${t('clientSecretLabel')}: ${result.clientSecret}`
          : `${t('clientIdLabel')}: ${result.clientId}\n${t('publicClientHint')}`,
      )
      setClientName('')
      setRedirectUris('')
      setNotice(t('clientCreated'))
      await utils.mcpAccess.listClients.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const disableClient = trpc.mcpAccess.disableClient.useMutation({
    onSuccess: async () => {
      setNotice(t('clientDisabled'))
      setConfirm(null)
      await utils.mcpAccess.listClients.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const status = statusQuery.data
  const keys = keysQuery.data
  const clients = clientsQuery.data

  function toggleScope(
    scope: typeof OPENSHOP_READ_SCOPE | typeof OPENSHOP_WRITE_PENDING_SCOPE,
    checked: boolean,
  ) {
    setKeyScopes((current) =>
      checked ? [...new Set([...current, scope])] : current.filter((item) => item !== scope),
    )
  }

  return (
    <div className="space-y-8">
      <ConsoleBreadcrumbRegistration
        items={[{ label: t('breadcrumbSettings'), href: '/settings' }, { label: t('title') }]}
      />
      <DetailPageHeader backHref="/settings" backLabel={t('breadcrumbSettings')} title={t('title')} description={t('pageDescription')} />

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{t('switchTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('switchDescription')}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={status?.envEnabled ? 'secondary' : 'outline'}>
            {status?.envEnabled ? t('envOn') : t('envOff')}
          </Badge>
          <Badge variant={status?.mcpExposed ? 'secondary' : 'outline'}>
            {status?.mcpExposed ? t('exposed') : t('notExposed')}
          </Badge>
        </div>
        {status?.resource ? (
          <p className="text-xs text-muted-foreground">
            {t('resource')}: {status.resource}
          </p>
        ) : null}
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={Boolean(status?.organizationEnabled)}
            disabled={!status || setEnabled.isPending}
            onCheckedChange={(enabled) => setEnabled.mutate({ enabled })}
          />
          {t('orgSwitch')}
        </label>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{t('keysTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('keysDescription')}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted-foreground">{t('keyName')}</span>
            <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
          </label>
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={keyScopes.includes(OPENSHOP_READ_SCOPE)}
                onChange={(event) => toggleScope(OPENSHOP_READ_SCOPE, event.target.checked)}
              />
              {t('scopeRead')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={keyScopes.includes(OPENSHOP_WRITE_PENDING_SCOPE)}
                onChange={(event) => toggleScope(OPENSHOP_WRITE_PENDING_SCOPE, event.target.checked)}
              />
              {t('scopeWritePending')}
            </label>
          </fieldset>
          <Button
            disabled={createKey.isPending || !keyName.trim() || keyScopes.length === 0}
            onClick={() => createKey.mutate({ name: keyName, scopes: keyScopes })}
          >
            {t('createKey')}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t('keyName')}</th>
                <th className="py-2 pr-3 font-medium">{t('prefix')}</th>
                <th className="py-2 pr-3 font-medium">{t('scopes')}</th>
                <th className="py-2 pr-3 font-medium">{t('status')}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(keys?.items ?? []).map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{item.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{item.keyPrefix}</td>
                  <td className="py-2 pr-3 text-xs">{item.scopes.join(', ')}</td>
                  <td className="py-2 pr-3">
                    {item.disabledAt ? (
                      <Badge variant="outline">{t('disabled')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('active')}</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {item.disabledAt ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirm({ type: 'key', id: item.id, name: item.name })}
                      >
                        {t('disable')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={keys?.page ?? 1}
          pageSize={keys?.pageSize ?? PAGE_SIZE}
          total={keys?.total ?? 0}
          onPage={setKeyPage}
        />
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{t('clientsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('clientsDescription')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t('clientName')}</span>
            <Input value={clientName} onChange={(event) => setClientName(event.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t('redirectUris')}</span>
            <Textarea
              rows={2}
              value={redirectUris}
              onChange={(event) => setRedirectUris(event.target.value)}
              placeholder="http://127.0.0.1:1455/callback"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={confidential}
              onChange={(event) => setConfidential(event.target.checked)}
            />
            {t('confidential')}
          </label>
          <label className="flex items-center gap-2">
            {t('applicationType')}
            <select
              className="rounded-md border bg-background px-2 py-1"
              value={applicationType}
              onChange={(event) => setApplicationType(event.target.value as 'web' | 'native')}
            >
              <option value="native">{t('native')}</option>
              <option value="web">{t('web')}</option>
            </select>
          </label>
          <Button
            disabled={createClient.isPending || !clientName.trim() || !redirectUris.trim()}
            onClick={() =>
              createClient.mutate({
                name: clientName,
                redirectUris: redirectUris
                  .split(/\s+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
                confidential,
                applicationType,
              })
            }
          >
            {t('createClient')}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t('clientName')}</th>
                <th className="py-2 pr-3 font-medium">client_id</th>
                <th className="py-2 pr-3 font-medium">{t('type')}</th>
                <th className="py-2 pr-3 font-medium">PKCE</th>
                <th className="py-2 pr-3 font-medium">{t('status')}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(clients?.items ?? []).map((item) => (
                <tr key={item.clientId} className="border-b last:border-0">
                  <td className="py-2 pr-3">{item.name ?? '—'}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{item.clientId}</td>
                  <td className="py-2 pr-3">
                    {item.tokenEndpointAuthMethod === 'none' ? t('public') : t('confidential')}
                  </td>
                  <td className="py-2 pr-3">{item.requirePKCE ? t('required') : t('optional')}</td>
                  <td className="py-2 pr-3">
                    {item.disabled ? (
                      <Badge variant="outline">{t('disabled')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('active')}</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {item.disabled ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirm({ type: 'client', id: item.clientId, name: item.name ?? item.clientId })
                        }
                      >
                        {t('disable')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={clients?.page ?? 1}
          pageSize={clients?.pageSize ?? PAGE_SIZE}
          total={clients?.total ?? 0}
          onPage={setClientPage}
        />
      </section>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'key'
                ? t('confirmDisableKey', { name: confirm.name })
                : confirm
                  ? t('confirmDisableClient', { name: confirm.name })
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return
                if (confirm.type === 'key') disableKey.mutate({ id: confirm.id })
                else disableClient.mutate({ clientId: confirm.id })
              }}
            >
              {t('disable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(revealedSecret)} onOpenChange={(open) => !open && setRevealedSecret(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('secretTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap font-mono text-xs">
              {revealedSecret}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRevealedSecret(undefined)}>{t('secretAck')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <span className="text-muted-foreground">
        {page} / {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        上一页
      </Button>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        下一页
      </Button>
    </div>
  )
}
