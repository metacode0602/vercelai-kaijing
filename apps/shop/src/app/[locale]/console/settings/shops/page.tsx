'use client'

import * as React from 'react'
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelStatus, labeledOptions } from '@/lib/console/labels'
import { INITIAL_COUNTRIES, INITIAL_CURRENCIES, INITIAL_PLATFORMS, INITIAL_WAREHOUSES } from '@/lib/crossborder/platform-basics-data'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'

type ShopDraft = {
  platform: string
  site: string
  name: string
  sellerId: string
  owner: string
  currency: string
  timezone: string
  fulfillment: string
  warehouseCodes: string[]
  defaultWarehouse: string
}

const emptyDraft: ShopDraft = {
  platform: 'lazada',
  site: '',
  name: '',
  sellerId: '',
  owner: '',
  currency: '',
  timezone: '',
  fulfillment: 'LGS',
  warehouseCodes: [],
  defaultWarehouse: '',
}

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'error') return 'destructive' as const
  if (status === 'connecting') return 'secondary' as const
  return 'outline' as const
}

const OAUTH_PLATFORMS = new Set(['daraz', 'lazada', 'tiktok_shop'])

const STATUSES = [...new Set(MOCK_SHOPS.map((s) => s.status))]
const PLATFORMS = [...new Set(MOCK_SHOPS.map((s) => s.platform))]

export default function SettingsShopsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<ShopDraft>(emptyDraft)
  const [createdShops, setCreatedShops] = React.useState<Array<{ id: string; name: string; platform: string; region: string; currency: string; externalShopId: string; status: string; health: string; lastSyncAt: string; warehouseNames: string[]; defaultWarehouse: string }>>([])
  const [notice, setNotice] = React.useState('')

  const rows = [...createdShops, ...MOCK_SHOPS].filter((shop) => {
    if (!matchesKeyword(keyword, shop.name, shop.id, shop.externalShopId, shop.region)) return false
    if (status !== 'all' && shop.status !== status) return false
    if (platform !== 'all' && shop.platform !== platform) return false
    return true
  })

  const platformRecord = INITIAL_PLATFORMS.find((item) => item.code === draft.platform)
  const availableSites = platformRecord?.countries.map((code) => INITIAL_COUNTRIES.find((country) => country.code === code)).filter((country) => country !== undefined) ?? []
  const selectedSite = availableSites.find((item) => item.code === draft.site)
  const availableWarehouses = INITIAL_WAREHOUSES.filter((warehouse) => warehouse.status === 'active')
  const creationSteps = ['平台与站点', '店铺信息', '仓库配置']

  function selectPlatform(nextPlatform: string) {
    const nextSites = INITIAL_PLATFORMS.find((item) => item.code === nextPlatform)?.countries ?? []
    const nextSite = nextSites[0] ?? ''
    const country = INITIAL_COUNTRIES.find((item) => item.code === nextSite)
    setDraft((current) => ({ ...current, platform: nextPlatform, site: nextSite, currency: country?.defaultCurrency ?? '', timezone: country?.timezone ?? '', fulfillment: nextSite === 'TH' ? 'JSB 灰清' : 'LGS' }))
  }

  function selectSite(nextSite: string) {
    const country = INITIAL_COUNTRIES.find((item) => item.code === nextSite)
    setDraft((current) => ({ ...current, site: nextSite, currency: country?.defaultCurrency ?? '', timezone: country?.timezone ?? '', fulfillment: nextSite === 'TH' ? 'JSB 灰清' : 'LGS' }))
  }

  function toggleWarehouse(code: string) {
    setDraft((current) => {
      const warehouseCodes = current.warehouseCodes.includes(code) ? current.warehouseCodes.filter((item) => item !== code) : [...current.warehouseCodes, code]
      const defaultWarehouse = warehouseCodes.includes(current.defaultWarehouse) ? current.defaultWarehouse : warehouseCodes[0] ?? ''
      return { ...current, warehouseCodes, defaultWarehouse }
    })
  }

  function saveShop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = `${draft.platform}-${draft.site}-${draft.sellerId.trim()}`
    const warehouseNames = draft.warehouseCodes.map((code) => availableWarehouses.find((warehouse) => warehouse.code === code)?.name ?? code)
    setCreatedShops((current) => [{ id, name: draft.name, platform: draft.platform, region: draft.site, currency: draft.currency, externalShopId: draft.sellerId, status: 'draft', health: 'idle', lastSyncAt: '—', warehouseNames, defaultWarehouse: draft.defaultWarehouse }, ...current])
    setCreateOpen(false)
    setStep(0)
    setDraft(emptyDraft)
    setNotice('店铺已添加到本次原型会话，未保存到服务器。')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">店铺连接</h2>
          <p className="text-sm text-muted-foreground">
            平台 / 区域 / 状态 / 平台店铺 ID · 授权连接走 OAuth
          </p>
        </div>
        <Button onClick={() => { setDraft({ ...emptyDraft }); selectPlatform(emptyDraft.platform); setStep(0); setCreateOpen(true) }}><Plus data-icon="inline-start" />添加店铺</Button>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="店铺名 / ID / 区域"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: labeledOptions(STATUSES),
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: setPlatform,
            options: PLATFORMS.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="店铺列表" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>区域</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>默认出库仓</TableHead>
                <TableHead>可选仓库</TableHead>
                <TableHead>平台店铺 ID</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>健康</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead>连接</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((shop) => {
                const canOauth = OAUTH_PLATFORMS.has(shop.platform)
                const href = canOauth
                  ? `/api/marketplace/oauth/authorize?platform=${shop.platform}&shopId=${shop.id}&locale=zh&region=${shop.region.toLowerCase()}`
                  : undefined
                return (
                  <TableRow key={shop.id}>
                    <TableCell className="font-medium">
                      <LocaleLink
                        href={`/console/settings/shops/${shop.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {shop.name}
                      </LocaleLink>
                    </TableCell>
                    <TableCell>{shop.platform}</TableCell>
                    <TableCell className="font-mono text-xs">{shop.region}</TableCell>
                    <TableCell>{shop.currency}</TableCell>
                    <TableCell>{'defaultWarehouse' in shop ? shop.defaultWarehouse : '—'}</TableCell>
                    <TableCell>{'warehouseNames' in shop ? shop.warehouseNames.join('、') : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{shop.externalShopId}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(shop.status)}>{labelStatus(shop.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{labelStatus(shop.health)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{shop.lastSyncAt}</TableCell>
                    <TableCell>
                      {href ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={href}>授权登录</a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          未接入
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {createOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setCreateOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="create-shop-title" className="w-full max-w-2xl rounded-xl border bg-background p-5 shadow-lg">
        <header className="mb-5 flex items-start justify-between gap-4"><div><h2 id="create-shop-title" className="font-semibold">添加平台店铺</h2><p className="mt-1 text-sm text-muted-foreground">{creationSteps[step]} · 第 {step + 1} / {creationSteps.length} 步</p></div><Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => setCreateOpen(false)}><X /></Button></header>
        <div className="mb-5 flex gap-2" aria-label="创建进度">{creationSteps.map((item, index) => <div key={item} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-muted'}`} aria-label={item} />)}</div>
        <form onSubmit={saveShop}>
          {step === 0 ? <div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="shop-platform">平台</Label><NativeSelect id="shop-platform" value={draft.platform} onChange={(event) => selectPlatform(event.target.value)}>{INITIAL_PLATFORMS.filter((item) => item.status === 'active').map((item) => <NativeSelectOption key={item.code} value={item.code}>{item.name}</NativeSelectOption>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label htmlFor="shop-site">国家 / 站点</Label><NativeSelect id="shop-site" value={draft.site} onChange={(event) => selectSite(event.target.value)}>{availableSites.map((item) => <NativeSelectOption key={item.code} value={item.code}>{item.name}（{item.code}）</NativeSelectOption>)}</NativeSelect></div>{selectedSite ? <div className="sm:col-span-2 rounded-md bg-muted/40 p-3 text-sm"><p>默认币种：{selectedSite.defaultCurrency} · 时区：{selectedSite.timezone}</p><p className="mt-1 text-muted-foreground">履约模式默认：{draft.fulfillment}</p></div> : <p className="sm:col-span-2 text-sm text-muted-foreground">该平台暂未配置可用站点。</p>}</div> : null}
          {step === 1 ? <div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="shop-name">店铺名称</Label><Input id="shop-name" required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="平台后台显示名称" /></div><div className="flex flex-col gap-2"><Label htmlFor="shop-seller-id">Seller ID</Label><Input id="shop-seller-id" required value={draft.sellerId} onChange={(event) => setDraft((current) => ({ ...current, sellerId: event.target.value }))} placeholder="平台 Seller ID" /></div><div className="flex flex-col gap-2"><Label htmlFor="shop-owner">负责人</Label><Input id="shop-owner" value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="选择负责人" /></div><div className="flex flex-col gap-2"><Label htmlFor="shop-currency">店铺币种</Label><NativeSelect id="shop-currency" value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}>{INITIAL_CURRENCIES.map((item) => <NativeSelectOption key={item.code} value={item.code}>{item.code} · {item.name}</NativeSelectOption>)}</NativeSelect><p className="text-xs text-muted-foreground">默认来自国家站点，可按业务调整。</p></div><div className="flex flex-col gap-2"><Label htmlFor="shop-timezone">时区</Label><Input id="shop-timezone" value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} /></div><div className="flex flex-col gap-2"><Label htmlFor="shop-fulfillment">履约模式</Label><NativeSelect id="shop-fulfillment" value={draft.fulfillment} onChange={(event) => setDraft((current) => ({ ...current, fulfillment: event.target.value }))}><NativeSelectOption value="LGS">LGS</NativeSelectOption><NativeSelectOption value="JSB 灰清">JSB 灰清</NativeSelectOption></NativeSelect></div></div> : null}
          {step === 2 ? <div className="flex flex-col gap-4"><div><h3 className="text-sm font-medium">选择可选仓库</h3><p className="mt-1 text-sm text-muted-foreground">店铺可以关联多个仓库；同一仓库也可供其他店铺使用。</p></div><div className="flex flex-col divide-y rounded-md border">{availableWarehouses.map((warehouse) => <label key={warehouse.code} className="flex cursor-pointer items-start gap-3 p-3"><input type="checkbox" checked={draft.warehouseCodes.includes(warehouse.code)} onChange={() => toggleWarehouse(warehouse.code)} className="mt-1 accent-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{warehouse.name}</span><span className="block font-mono text-xs text-muted-foreground">{warehouse.code} · {warehouse.type} · {warehouse.country}</span></span>{draft.warehouseCodes.includes(warehouse.code) ? <Badge variant="secondary">已选择</Badge> : null}</label>)}{availableWarehouses.length === 0 ? <p className="p-4 text-sm text-muted-foreground">暂无可用仓库，请先在“平台基础资料”中创建仓库。</p> : null}</div><fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">默认出库仓（必选一个）</legend>{draft.warehouseCodes.map((code) => { const warehouse = availableWarehouses.find((item) => item.code === code); return warehouse ? <label key={code} className="flex items-center gap-2 text-sm"><input type="radio" name="default-warehouse" value={code} checked={draft.defaultWarehouse === code} onChange={() => setDraft((current) => ({ ...current, defaultWarehouse: code }))} className="accent-primary" />{warehouse.name} <span className="font-mono text-xs text-muted-foreground">{warehouse.code}</span></label> : null })}{draft.warehouseCodes.length === 0 ? <p className="text-sm text-muted-foreground">先选择可选仓库，再设置默认出库仓。</p> : null}</fieldset></div> : null}
          <footer className="mt-6 flex items-center justify-between border-t pt-4"><Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft data-icon="inline-start" />上一步</Button>{step < creationSteps.length - 1 ? <Button type="button" onClick={() => setStep((current) => current + 1)} disabled={step === 0 && (!draft.platform || !draft.site) || step === 1 && (!draft.name || !draft.sellerId)}><ChevronRight data-icon="inline-end" />下一步</Button> : <Button type="submit" disabled={draft.warehouseCodes.length === 0 || !draft.defaultWarehouse}><Check data-icon="inline-start" />添加示例店铺</Button>}</footer>
        </form>
      </section></div> : null}
    </div>
  )
}
