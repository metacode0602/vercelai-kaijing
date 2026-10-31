'use client'

/**
 * 店铺连接 / 授权 / 同步暂停 — 运营面原型会话 store（Phase 4）。
 * 中文状态投影；不调用真实 OAuth（按钮仅为原型）。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'

export const SHOP_AUTH_STATUSES = ['已授权', '待授权', '授权失效', '连接中', '草稿'] as const
export type ShopAuthStatus = (typeof SHOP_AUTH_STATUSES)[number]

export type ShopConnection = {
  id: string
  name: string
  platform: string
  platformLabel: string
  region: string
  currency: string
  /** 平台店铺 ID（marketplace shop / store id） */
  externalShopId: string
  /** 卖家侧标识；可与平台店铺 ID 不同，勿混用 */
  sellerId: string
  /** 店铺分组，如 Lazada 五国 / Daraz */
  shopGroup: string
  /** 履约模式：自营仓发货 / 平台仓 / 混合 */
  fulfillmentMode: '自营仓发货' | '平台仓' | '混合'
  authStatus: ShopAuthStatus
  healthLabel: string
  syncPaused: boolean
  lastSyncAt: string
  lastOrdersSyncAt: string
  lastInventorySyncAt: string
  lastError: string
  credentialMask: string
  authExpiresAt: string
  defaultWarehouse: string
  warehouseNames: string[]
  owner: string
}

const PLATFORM_LABEL: Record<string, string> = {
  daraz: 'Daraz',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
  shopee: 'Shopee',
}

function authFromMock(status: string): ShopAuthStatus {
  if (status === 'active') return '已授权'
  if (status === 'connecting') return '连接中'
  if (status === 'error') return '授权失效'
  if (status === 'draft') return '草稿'
  return '待授权'
}

function healthLabel(health: string) {
  if (health === 'success') return '正常'
  if (health === 'error') return '异常'
  if (health === 'idle') return '空闲'
  return health || '—'
}

function defaultGroup(platform: string, region: string) {
  if (platform === 'lazada') return 'Lazada 五国'
  if (platform === 'daraz') return 'Daraz'
  return `${PLATFORM_LABEL[platform] ?? platform} · ${region}`
}

function defaultFulfillment(region: string): ShopConnection['fulfillmentMode'] {
  if (region === 'TH') return '混合'
  return '自营仓发货'
}

function seed(): ShopConnection[] {
  return MOCK_SHOPS.map((shop) => ({
    id: shop.id,
    name: shop.name,
    platform: shop.platform,
    platformLabel: PLATFORM_LABEL[shop.platform] ?? shop.platform,
    region: shop.region,
    currency: shop.currency,
    externalShopId: shop.externalShopId,
    sellerId: shop.sellerName,
    shopGroup: defaultGroup(shop.platform, shop.region),
    fulfillmentMode: defaultFulfillment(shop.region),
    authStatus: authFromMock(shop.status),
    healthLabel: healthLabel(shop.health),
    syncPaused: (shop.status as string) === 'error' || (shop.syncStatus as string) === 'error',
    lastSyncAt: shop.lastSyncAt || '—',
    lastOrdersSyncAt: shop.lastOrdersSyncAt || '—',
    lastInventorySyncAt: shop.lastInventorySyncAt || '—',
    lastError: shop.lastError || '—',
    credentialMask: shop.credentialMask || '····',
    authExpiresAt: shop.authExpiresAt || '—',
    defaultWarehouse:
      typeof shop.meta === 'object' && shop.meta && 'warehouseDefault' in shop.meta
        ? String((shop.meta as { warehouseDefault?: string }).warehouseDefault ?? '—')
        : '—',
    warehouseNames: [],
    owner: shop.sellerName || '—',
  }))
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const store = createDemoStore<ShopConnection[]>(
  'open-shop.console.demo.shop-connections.v2',
  seed(),
)

export function useShopConnections() {
  return store.useStore()
}

export function getShopConnections() {
  return store.get()
}

export function getShopConnection(id: string) {
  return store.get().find((item) => item.id === id)
}

export function countShopKpi(rows: ShopConnection[]) {
  return {
    total: rows.length,
    authorized: rows.filter((r) => r.authStatus === '已授权').length,
    pending: rows.filter((r) => r.authStatus === '待授权' || r.authStatus === '连接中' || r.authStatus === '草稿').length,
    expired: rows.filter((r) => r.authStatus === '授权失效').length,
    paused: rows.filter((r) => r.syncPaused).length,
  }
}

export function setShopSyncPaused(
  id: string,
  paused: boolean,
): { ok: true; row: ShopConnection } | { ok: false; reason: string } {
  const list = store.get()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: '店铺不存在' }
  const next: ShopConnection = {
    ...list[index]!,
    syncPaused: paused,
    lastSyncAt: paused ? list[index]!.lastSyncAt : nowStamp(),
  }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return { ok: true, row: next }
}

export function markShopReauthQueued(
  id: string,
): { ok: true; row: ShopConnection } | { ok: false; reason: string } {
  const list = store.get()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: '店铺不存在' }
  const next: ShopConnection = {
    ...list[index]!,
    authStatus: '连接中',
    healthLabel: '空闲',
    lastError: 'OAuth 重授权已排队（原型，未跳转真实平台）',
  }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return { ok: true, row: next }
}

export function addShopConnection(input: {
  name: string
  platform: string
  region: string
  currency: string
  externalShopId: string
  sellerId?: string
  shopGroup?: string
  fulfillmentMode?: ShopConnection['fulfillmentMode']
  defaultWarehouse?: string
  warehouseNames?: string[]
  owner?: string
}): { ok: true; row: ShopConnection } | { ok: false; reason: string } {
  if (!input.name.trim()) return { ok: false, reason: '店铺名称不能为空' }
  if (!input.externalShopId.trim()) return { ok: false, reason: '平台店铺 ID 不能为空' }
  const id = `${input.platform}-${input.region}-${input.externalShopId.trim()}`
  if (store.get().some((item) => item.id === id)) {
    return { ok: false, reason: '该店铺已存在于原型会话' }
  }
  const row: ShopConnection = {
    id,
    name: input.name.trim(),
    platform: input.platform,
    platformLabel: PLATFORM_LABEL[input.platform] ?? input.platform,
    region: input.region,
    currency: input.currency,
    externalShopId: input.externalShopId.trim(),
    sellerId: (input.sellerId || '').trim() || `seller-${input.externalShopId.trim()}`,
    shopGroup: (input.shopGroup || '').trim() || defaultGroup(input.platform, input.region),
    fulfillmentMode: input.fulfillmentMode || defaultFulfillment(input.region),
    authStatus: '草稿',
    healthLabel: '空闲',
    syncPaused: true,
    lastSyncAt: '—',
    lastOrdersSyncAt: '—',
    lastInventorySyncAt: '—',
    lastError: '—',
    credentialMask: '····none',
    authExpiresAt: '—',
    defaultWarehouse: input.defaultWarehouse || '—',
    warehouseNames: input.warehouseNames || [],
    owner: input.owner || '—',
  }
  store.set([row, ...store.get()])
  return { ok: true, row }
}

export function toRelatedShopShape(row: ShopConnection): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    shop: row.name,
    platform: row.platformLabel,
    site: row.region,
    sellerId: row.sellerId,
    shopGroup: row.shopGroup,
    fulfillmentMode: row.fulfillmentMode,
    externalShopId: row.externalShopId,
    status: row.authStatus,
    syncPaused: row.syncPaused ? '已暂停' : '同步中',
    lastSyncAt: row.lastSyncAt,
  }
}

export function updateShopConnection(
  id: string,
  patch: Partial<
    Pick<
      ShopConnection,
      | 'name'
      | 'sellerId'
      | 'shopGroup'
      | 'fulfillmentMode'
      | 'defaultWarehouse'
      | 'owner'
      | 'currency'
    >
  >,
): { ok: true; row: ShopConnection } | { ok: false; reason: string } {
  const list = store.get()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: '店铺不存在' }
  const next = { ...list[index]!, ...patch }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return { ok: true, row: next }
}
