/**
 * 平台基础资料（平台 / 国家站点 / 币种）的初始化数据与组织初始化。
 *
 * - `DEFAULT_PLATFORM_BASICS` 是平台侧初始目录，由 `db:seed:platform-basics` 写入
 *   `platform_basics_catalog`；之后平台管理员在 apps/web 维护，目录是唯一的真源。
 * - 企业入驻审核通过时调用 `initializePlatformBasicsForOrganization`，把目录复制成
 *   该组织的 `commerce_platform_basics` 副本；此后组织内 CRUD 只改自己的副本。
 * - 两个函数都幂等：只补缺失的 (kind, code)，不覆盖已有行（平台改目录、组织改副本互不影响）。
 *
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */
import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { z } from "zod"
import type { AppDatabase } from "./client"
import {
  commercePlatformBasics,
  platformApiReadyStates,
  platformBasicsCatalog,
  platformBasicKinds,
  platformBasicStatuses,
  type PlatformApiReadyState,
  type PlatformBasicsCatalogRow,
  type PlatformBasicKind,
  type PlatformBasicStatus,
} from "./commerce-schema"

export type DbLike = AppDatabase | Parameters<Parameters<AppDatabase["transaction"]>[0]>[0]

/** 平台基础资料的归一化业务字段（平台目录行与组织副本行同构）。 */
export type PlatformBasicRecord = {
  kind: PlatformBasicKind
  code: string
  name: string
  status: PlatformBasicStatus
  description: string
  sortOrder: number
  region: string | null
  timezone: string | null
  defaultCurrency: string | null
  symbol: string | null
  decimals: number | null
  countries: string[]
  apiReady: PlatformApiReadyState | null
}

export { platformBasicKinds }

export const platformBasicKindLabels: Record<PlatformBasicKind, string> = {
  platform: "平台",
  country: "国家 / 站点",
  currency: "币种",
}

// ---------------------------------------------------------------------------
// 输入校验：apps/web（平台目录）与 apps/shop（组织副本）共用同一套规则
// ---------------------------------------------------------------------------

const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/

const platformBasicShape = {
  kind: z.enum(platformBasicKinds),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  status: z.enum(platformBasicStatuses).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  region: z.string().trim().max(64).nullish(),
  timezone: z.string().trim().max(64).nullish(),
  defaultCurrency: z.string().trim().max(16).nullish(),
  symbol: z.string().trim().max(16).nullish(),
  decimals: z.number().int().min(0).max(4).nullish(),
  countries: z.array(z.string().trim().min(1).max(16)).max(64).optional(),
  apiReady: z.enum(platformApiReadyStates).nullish(),
}

type PlatformBasicDraft = {
  kind: PlatformBasicKind
  code: string
  name: string
  status?: PlatformBasicStatus | undefined
  description?: string | undefined
  sortOrder?: number | undefined
  region?: string | null | undefined
  timezone?: string | null | undefined
  defaultCurrency?: string | null | undefined
  symbol?: string | null | undefined
  decimals?: number | null | undefined
  countries?: string[] | undefined
  apiReady?: PlatformApiReadyState | null | undefined
}

function checkPlatformBasicDraft(
  value: PlatformBasicDraft,
  ctx: z.core.$RefinementCtx<PlatformBasicDraft>,
) {
  const fail = (message: string, path: PropertyKey[]) =>
    ctx.addIssue({ code: "custom", message, path })

  // 校验前按 kind 归一大小写，与 finalizePlatformBasic 一致（Daraz → daraz、lk → LK）
  const code =
    value.kind === "platform"
      ? value.code.trim().toLowerCase()
      : value.code.trim().toUpperCase()

  if (value.kind === "platform") {
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(code)) {
      fail("平台代码应为小写字母开头的标识，如 daraz", ["code"])
    }
    return
  }
  if (value.kind === "country") {
    if (!/^[A-Z]{2}$/.test(code)) fail("国家代码应为 2 位字母，如 LK", ["code"])
    if (!value.timezone) {
      fail("国家必须填写时区", ["timezone"])
    } else if (!TIMEZONE_PATTERN.test(value.timezone)) {
      fail("时区格式应为 Area/City，如 Asia/Colombo", ["timezone"])
    }
    if (!value.defaultCurrency) fail("国家必须填写默认币种代码", ["defaultCurrency"])
    return
  }
  if (!/^[A-Z]{3}$/.test(code)) fail("币种代码应为 3 位字母，如 LKR", ["code"])
  if (!value.symbol) fail("币种必须填写符号", ["symbol"])
  if (value.decimals == null) fail("币种必须填写小数位（0–4）", ["decimals"])
}

function finalizePlatformBasic(value: PlatformBasicDraft): PlatformBasicRecord {
  const code = value.kind === "platform" ? value.code.toLowerCase() : value.code.toUpperCase()
  const isPlatform = value.kind === "platform"
  return {
    kind: value.kind,
    code,
    name: value.name,
    status: value.status ?? "active",
    description: value.description ?? "",
    sortOrder: value.sortOrder ?? 0,
    region: isPlatform ? null : value.region ?? null,
    timezone: isPlatform ? null : value.timezone ?? null,
    defaultCurrency: isPlatform ? null : value.defaultCurrency?.toUpperCase() ?? null,
    symbol: value.kind === "currency" ? value.symbol ?? null : null,
    decimals: value.kind === "currency" ? value.decimals ?? null : null,
    countries: isPlatform
      ? Array.from(new Set((value.countries ?? []).map((item) => item.toUpperCase()).filter(Boolean)))
      : [],
    apiReady: isPlatform ? value.apiReady ?? null : null,
  }
}

/** 新增：平台目录 / 组织副本同构；不传的可选字段按 kind 归一（多余的字段会被清空）。 */
export const platformBasicCreateSchema = z
  .object(platformBasicShape)
  .superRefine(checkPlatformBasicDraft)
  .transform(finalizePlatformBasic)

/** 更新：与新增同规则，带 id；整行覆盖，保证行始终满足 kind 约束。 */
export const platformBasicUpdateSchema = z
  .object({ id: z.string().trim().min(1), ...platformBasicShape })
  .superRefine(checkPlatformBasicDraft)
  .transform(({ id, ...rest }) => ({ id, ...finalizePlatformBasic(rest) }))

export type PlatformBasicCreateInput = z.input<typeof platformBasicCreateSchema>
export type PlatformBasicValue = z.output<typeof platformBasicCreateSchema>
export type PlatformBasicUpdateInput = z.input<typeof platformBasicUpdateSchema>
export type PlatformBasicUpdatedValue = z.output<typeof platformBasicUpdateSchema>

/**
 * 平台初始目录：与原先设置页的静态参考数据一致。
 * 平台管理员可在此增补；组织初始化以此为起点，随后以平台侧维护结果为准。
 */
export const DEFAULT_PLATFORM_BASICS: PlatformBasicRecord[] = [
  {
    kind: "platform",
    code: "lazada",
    name: "Lazada",
    status: "active",
    description: "",
    sortOrder: 1,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: null,
    decimals: null,
    countries: ["MY", "PH", "SG", "TH", "VN"],
    apiReady: "Configuration required",
  },
  {
    kind: "platform",
    code: "daraz",
    name: "Daraz",
    status: "active",
    description: "",
    sortOrder: 2,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: null,
    decimals: null,
    countries: ["LK"],
    apiReady: "Configuration required",
  },
  {
    kind: "platform",
    code: "shopee",
    name: "Shopee",
    status: "inactive",
    description: "",
    sortOrder: 3,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: "Planned",
  },
  {
    kind: "platform",
    code: "tiktok_shop",
    name: "TikTok Shop",
    status: "inactive",
    description: "",
    sortOrder: 4,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: "Planned",
  },
  {
    kind: "country",
    code: "CN",
    name: "中国",
    status: "active",
    description: "",
    sortOrder: 1,
    region: "东亚",
    timezone: "Asia/Shanghai",
    defaultCurrency: "CNY",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "country",
    code: "MY",
    name: "马来西亚",
    status: "active",
    description: "",
    sortOrder: 2,
    region: "东南亚",
    timezone: "Asia/Kuala_Lumpur",
    defaultCurrency: "MYR",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "country",
    code: "PH",
    name: "菲律宾",
    status: "active",
    description: "",
    sortOrder: 3,
    region: "东南亚",
    timezone: "Asia/Manila",
    defaultCurrency: "PHP",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "country",
    code: "SG",
    name: "新加坡",
    status: "active",
    description: "",
    sortOrder: 4,
    region: "东南亚",
    timezone: "Asia/Singapore",
    defaultCurrency: "SGD",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "country",
    code: "TH",
    name: "泰国",
    status: "active",
    description: "",
    sortOrder: 5,
    region: "东南亚",
    timezone: "Asia/Bangkok",
    defaultCurrency: "THB",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "country",
    code: "VN",
    name: "越南",
    status: "active",
    description: "",
    sortOrder: 6,
    region: "东南亚",
    timezone: "Asia/Ho_Chi_Minh",
    defaultCurrency: "VND",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "country",
    code: "LK",
    name: "斯里兰卡",
    status: "active",
    description: "",
    sortOrder: 7,
    region: "南亚",
    timezone: "Asia/Colombo",
    defaultCurrency: "LKR",
    symbol: null,
    decimals: null,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "CNY",
    name: "人民币",
    status: "active",
    description: "",
    sortOrder: 1,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "¥",
    decimals: 2,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "MYR",
    name: "马来西亚林吉特",
    status: "active",
    description: "",
    sortOrder: 2,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "RM",
    decimals: 2,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "PHP",
    name: "菲律宾比索",
    status: "active",
    description: "",
    sortOrder: 3,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "₱",
    decimals: 2,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "SGD",
    name: "新加坡元",
    status: "active",
    description: "",
    sortOrder: 4,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "S$",
    decimals: 2,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "THB",
    name: "泰铢",
    status: "active",
    description: "",
    sortOrder: 5,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "฿",
    decimals: 2,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "VND",
    name: "越南盾",
    status: "active",
    description: "",
    sortOrder: 6,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "₫",
    decimals: 0,
    countries: [],
    apiReady: null,
  },
  {
    kind: "currency",
    code: "LKR",
    name: "斯里兰卡卢比",
    status: "active",
    description: "",
    sortOrder: 7,
    region: null,
    timezone: null,
    defaultCurrency: null,
    symbol: "Rs",
    decimals: 2,
    countries: [],
    apiReady: null,
  },
]

function toValues(record: PlatformBasicRecord) {
  return {
    kind: record.kind,
    code: record.code,
    name: record.name,
    status: record.status,
    description: record.description,
    sortOrder: record.sortOrder,
    region: record.region,
    timezone: record.timezone,
    defaultCurrency: record.defaultCurrency,
    symbol: record.symbol,
    decimals: record.decimals,
    countries: record.countries,
    apiReady: record.apiReady,
  }
}

function isPlatformBasicKind(value: string | null | undefined): value is PlatformBasicKind {
  return platformBasicKinds.includes(value as PlatformBasicKind)
}

/** 平台目录行 → 归一化记录；kind 非法（历史脏数据）时返回 null，跳过初始化。 */
function catalogRowToRecord(row: PlatformBasicsCatalogRow): PlatformBasicRecord | null {
  if (!isPlatformBasicKind(row.kind)) return null
  return {
    kind: row.kind,
    code: row.code,
    name: row.name,
    status: row.status,
    description: row.description,
    sortOrder: row.sortOrder,
    region: row.region,
    timezone: row.timezone,
    defaultCurrency: row.defaultCurrency,
    symbol: row.symbol,
    decimals: row.decimals,
    countries: Array.isArray(row.countries) ? row.countries.map(String) : [],
    apiReady: row.apiReady && platformApiReadyStates.includes(row.apiReady) ? row.apiReady : null,
  }
}

/**
 * 把 `DEFAULT_PLATFORM_BASICS` 补进平台目录：只新增缺失的 (kind, code)，不覆盖平台已维护的行。
 * 返回补写条数。
 */
export async function ensurePlatformBasicsCatalog(db: DbLike): Promise<{ inserted: number }> {
  const existing = await db
    .select({ kind: platformBasicsCatalog.kind, code: platformBasicsCatalog.code })
    .from(platformBasicsCatalog)
  const present = new Set(existing.map((row) => `${row.kind}:${row.code}`))
  const now = new Date()
  const rows = DEFAULT_PLATFORM_BASICS.filter(
    (record) => !present.has(`${record.kind}:${record.code}`),
  ).map((record) => ({
    id: createId(),
    ...toValues(record),
    createdAt: now,
    updatedAt: now,
  }))
  if (rows.length > 0) {
    await db.insert(platformBasicsCatalog).values(rows)
  }
  return { inserted: rows.length }
}

/**
 * 把平台目录初始化到组织下：只补该组织缺失的 (kind, code)，已存在（含组织已改过）的行不动。
 * 需在审核通过的事务内调用；返回补写条数。
 */
export async function initializePlatformBasicsForOrganization(
  db: DbLike,
  organizationId: string,
): Promise<{ inserted: number }> {
  const catalog = await db
    .select()
    .from(platformBasicsCatalog)
    .orderBy(platformBasicsCatalog.sortOrder, platformBasicsCatalog.code)
  if (catalog.length === 0) return { inserted: 0 }

  const existing = await db
    .select({ kind: commercePlatformBasics.kind, code: commercePlatformBasics.code })
    .from(commercePlatformBasics)
    .where(eq(commercePlatformBasics.organizationId, organizationId))
  const present = new Set(existing.map((row) => `${row.kind}:${row.code}`))
  const now = new Date()
  const rows = catalog.flatMap((row) => {
    const record = catalogRowToRecord(row)
    if (!record || present.has(`${record.kind}:${record.code}`)) return []
    return [
      {
        id: createId(),
        organizationId,
        sourceId: row.id,
        ...toValues(record),
        createdAt: now,
        updatedAt: now,
      },
    ]
  })
  if (rows.length > 0) {
    await db.insert(commercePlatformBasics).values(rows)
  }
  return { inserted: rows.length }
}
