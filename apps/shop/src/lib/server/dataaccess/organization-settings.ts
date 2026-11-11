/**
 * 组织级偏好与钉钉通知配置。每组织一行，首次保存时创建。
 * Webhook 使用与平台凭证相同的 AES-256-GCM 加密，读取接口只返回脱敏值。
 */
import { and, eq, isNull } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from '@workspace/marketplace'
import { organizationSettings, shops } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { maskDingTalkWebhookUrl, postDingTalkText, validateDingTalkWebhookUrl } from '@/lib/server/dingtalk'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export const TABLE_DENSITY_LABELS = {
  comfortable: '舒适',
  compact: '紧凑',
} as const

export type TableDensity = keyof typeof TABLE_DENSITY_LABELS

export type OrganizationPreferencesDto = {
  defaultShopId: string | null
  defaultShopName: string | null
  timezone: string
  displayCurrency: string
  tableDensity: TableDensity
  tableDensityLabel: string
}

export type OrganizationNotificationSettingsDto = {
  dingtalkEnabled: boolean
  webhookConfigured: boolean
  webhookMasked: string | null
}

const DEFAULT_PREFERENCES: OrganizationPreferencesDto = {
  defaultShopId: null,
  defaultShopName: null,
  timezone: 'Asia/Shanghai',
  displayCurrency: 'USD',
  tableDensity: 'comfortable',
  tableDensityLabel: TABLE_DENSITY_LABELS.comfortable,
}

function toDensity(value: string | null | undefined): TableDensity {
  return value === 'compact' ? 'compact' : 'comfortable'
}

function fromDensityLabel(value: string | undefined): TableDensity {
  if (value === '紧凑' || value === 'compact') return 'compact'
  return 'comfortable'
}

async function shopName(
  db: DbLike,
  organizationId: string,
  shopId: string | null,
): Promise<string | null> {
  if (!shopId) return null
  const [row] = await db
    .select({ name: shops.name })
    .from(shops)
    .where(and(eq(shops.id, shopId), eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .limit(1)
  return row?.name ?? null
}

async function resolveOwnedShopId(
  db: DbLike,
  organizationId: string,
  shopId: string | null | undefined,
): Promise<string | null> {
  if (shopId == null || shopId === '') return null
  const [row] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(and(eq(shops.id, shopId), eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .limit(1)
  if (!row) {
    throw new Error('默认店铺不存在或不属于当前组织')
  }
  return row.id
}

async function getRow(db: DbLike, organizationId: string) {
  const [row] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

async function ensureRow(db: DbLike, organizationId: string) {
  const existing = await getRow(db, organizationId)
  if (existing) return existing
  await db.insert(organizationSettings).values({ organizationId })
  const created = await getRow(db, organizationId)
  if (!created) throw new Error('无法初始化组织配置')
  return created
}

export async function getOrganizationPreferences(
  db: DbLike,
  organizationId: string,
): Promise<OrganizationPreferencesDto> {
  const row = await getRow(db, organizationId)
  if (!row) return { ...DEFAULT_PREFERENCES }
  const density = toDensity(row.tableDensity)
  return {
    defaultShopId: row.defaultShopId,
    defaultShopName: await shopName(db, organizationId, row.defaultShopId),
    timezone: row.timezone || DEFAULT_PREFERENCES.timezone,
    displayCurrency: row.displayCurrency || DEFAULT_PREFERENCES.displayCurrency,
    tableDensity: density,
    tableDensityLabel: TABLE_DENSITY_LABELS[density],
  }
}

export async function updateOrganizationPreferences(
  db: AppDatabase,
  organizationId: string,
  input: {
    defaultShopId?: string | null
    timezone?: string
    displayCurrency?: string
    tableDensity?: string
  },
): Promise<OrganizationPreferencesDto> {
  const defaultShopId =
    input.defaultShopId !== undefined
      ? await resolveOwnedShopId(db, organizationId, input.defaultShopId)
      : undefined
  const timezone = input.timezone?.trim()
  if (timezone !== undefined && !timezone) throw new Error('时区不能为空')
  const displayCurrency = input.displayCurrency?.trim().toUpperCase()
  if (displayCurrency !== undefined && !/^[A-Z]{3}$/.test(displayCurrency)) {
    throw new Error('展示币种须为三位货币代码，如 USD')
  }

  await ensureRow(db, organizationId)
  await db
    .update(organizationSettings)
    .set({
      ...(defaultShopId !== undefined ? { defaultShopId } : {}),
      ...(timezone ? { timezone } : {}),
      ...(displayCurrency ? { displayCurrency } : {}),
      ...(input.tableDensity !== undefined ? { tableDensity: fromDensityLabel(input.tableDensity) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizationSettings.organizationId, organizationId))
  return getOrganizationPreferences(db, organizationId)
}

function decryptWebhook(blob: string | null | undefined): string | null {
  if (!blob) return null
  try {
    return decryptSecret(blob)
  } catch {
    throw new Error('已保存的 Webhook 无法解密，请重新填写并保存')
  }
}

export async function getOrganizationNotificationSettings(
  db: DbLike,
  organizationId: string,
): Promise<OrganizationNotificationSettingsDto> {
  const row = await getRow(db, organizationId)
  const webhook = row ? decryptWebhook(row.dingtalkWebhookEncrypted) : null
  return {
    dingtalkEnabled: Boolean(row?.dingtalkEnabled),
    webhookConfigured: Boolean(webhook),
    webhookMasked: maskDingTalkWebhookUrl(webhook),
  }
}

export async function updateOrganizationNotificationSettings(
  db: AppDatabase,
  organizationId: string,
  input: { dingtalkEnabled: boolean; webhookUrl?: string },
): Promise<OrganizationNotificationSettingsDto> {
  const current = await ensureRow(db, organizationId)
  const currentWebhook = decryptWebhook(current.dingtalkWebhookEncrypted)
  const incoming = input.webhookUrl?.trim()
  let nextWebhook = currentWebhook
  if (incoming) {
    validateDingTalkWebhookUrl(incoming)
    nextWebhook = incoming
  }
  if (input.dingtalkEnabled && !nextWebhook) {
    throw new Error('启用钉钉通知前请填写 Webhook 地址')
  }
  await db
    .update(organizationSettings)
    .set({
      dingtalkEnabled: input.dingtalkEnabled,
      dingtalkWebhookEncrypted: nextWebhook ? encryptSecret(nextWebhook) : null,
      updatedAt: new Date(),
    })
    .where(eq(organizationSettings.organizationId, organizationId))
  return getOrganizationNotificationSettings(db, organizationId)
}

export async function sendDingTalkTextForOrg(
  db: DbLike,
  organizationId: string,
  content: string,
  overrideWebhookUrl?: string,
): Promise<{ ok: true; errmsg: string }> {
  const row = await getRow(db, organizationId)
  const webhook = overrideWebhookUrl?.trim() || decryptWebhook(row?.dingtalkWebhookEncrypted)
  if (!webhook) throw new Error('尚未配置钉钉 Webhook，请先保存后再发送')
  return postDingTalkText(webhook, content)
}

/** 事件钩子：未启用或未配置时静默跳过；发送失败只记日志，不回滚业务。 */
export function scheduleDingTalkIfEnabled(
  db: DbLike,
  organizationId: string,
  content: string,
): void {
  void (async () => {
    try {
      const row = await getRow(db, organizationId)
      if (!row?.dingtalkEnabled) return
      const webhook = decryptWebhook(row.dingtalkWebhookEncrypted)
      if (!webhook) return
      await postDingTalkText(webhook, content)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      console.error('[dingtalk] 组织通知发送失败', { organizationId, message })
    }
  })()
}
