/**
 * Server-only client from apps/shop → apps/api marketplace sync.
 * Independent deploy: set MARKETPLACE_API_BASE_URL + INTERNAL_SYNC_API_KEY.
 * Same-box monorepo: defaults to http://127.0.0.1:8080 when base URL unset is NOT assumed;
 * missing config fails honestly (never fake success).
 */

export type MarketplaceSyncResource =
  | 'orders'
  | 'logistics'
  | 'reviews'
  | 'listings'
  | 'settlements'
  | 'all'

export interface TriggerMarketplaceSyncInput {
  resource: MarketplaceSyncResource
  organizationId: string
  shopId?: string
  syncTaskId?: string
  requestId?: string
  /** Default true — wait for API result. */
  wait?: boolean
}

export interface TriggerMarketplaceSyncResult {
  ok: boolean
  status: number
  error?: string
  result?: Record<string, unknown>
  raw?: unknown
}

function config() {
  const baseUrl = (process.env.MARKETPLACE_API_BASE_URL || process.env.API_BASE_URL || '').trim().replace(/\/$/, '')
  const apiKey = (process.env.INTERNAL_SYNC_API_KEY || '').trim()
  return { baseUrl, apiKey }
}

export function marketplaceApiConfigured(): boolean {
  const { baseUrl, apiKey } = config()
  return Boolean(baseUrl && apiKey && apiKey.length >= 16)
}

export async function triggerMarketplaceSync(
  input: TriggerMarketplaceSyncInput,
): Promise<TriggerMarketplaceSyncResult> {
  const { baseUrl, apiKey } = config()
  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        '未配置 MARKETPLACE_API_BASE_URL / INTERNAL_SYNC_API_KEY，无法调用 apps/api 平台同步。禁止假成功。',
    }
  }
  if (apiKey.length < 16) {
    return {
      ok: false,
      status: 503,
      error: 'INTERNAL_SYNC_API_KEY 长度不足，拒绝调用。',
    }
  }

  const url = `${baseUrl}/api/v1/sync/marketplace`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-internal-sync-key': apiKey,
      },
      body: JSON.stringify({
        resource: input.resource,
        organizationId: input.organizationId,
        shopId: input.shopId,
        syncTaskId: input.syncTaskId,
        requestId: input.requestId,
        wait: input.wait !== false,
      }),
      cache: 'no-store',
    })
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `调用 apps/api 失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const raw = await response.json().catch(() => ({}))
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        typeof payload.error === 'string'
          ? payload.error
          : `apps/api 返回 HTTP ${response.status}`,
      raw,
    }
  }
  return {
    ok: payload.ok !== false,
    status: response.status,
    result: (payload.result as Record<string, unknown> | undefined) ?? payload,
    raw,
    error:
      payload.ok === false
        ? typeof payload.error === 'string'
          ? payload.error
          : '平台同步返回失败'
        : undefined,
  }
}

export function resourceForSyncTaskType(type: string): MarketplaceSyncResource {
  switch (type) {
    case 'orders':
      return 'orders'
    case 'reviews':
      return 'reviews'
    case 'publish':
    case 'listings':
      return 'listings'
    case 'logistics':
      return 'logistics'
    case 'settlements':
    case 'finance':
      return 'settlements'
    case 'returns':
      return 'orders'
    default:
      return 'orders'
  }
}
