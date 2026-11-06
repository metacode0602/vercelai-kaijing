import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const commaSeparatedList = z
  .string()
  .optional()
  .transform((val) =>
    val
      ? val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  )

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .optional()
      .default("8080")
      .transform(Number)
      .pipe(z.number().int().positive()),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url().optional(),
    BETTER_AUTH_TRUSTED_ORIGINS: commaSeparatedList,
    /**
     * 平台内部服务间同步凭证（/api/v1/sync/*）。
     * 未配置时该端点一律 401 —— 宁可不可用，也不能裸奔。
     */
    INTERNAL_SYNC_API_KEY: z.string().min(16).optional(),
    /** 手动触发应用内 cron 的共享密钥（POST /api/v1/cron/marketplace-sync）。 */
    CRON_SECRET: z.string().min(16).optional(),
    /** 应用内 marketplace 同步开关；默认开启，设置 false/0 可关闭。 */
    MARKETPLACE_SYNC_CRON_ENABLED: z
      .string()
      .optional()
      .default("true")
      .transform((value) => value !== "false" && value !== "0"),
    MARKETPLACE_SYNC_ORDERS_CRON: z.string().default("*/15 * * * *"),
    MARKETPLACE_SYNC_LOGISTICS_CRON: z.string().default("*/30 * * * *"),
    MARKETPLACE_SYNC_REVIEWS_CRON: z.string().default("0 */6 * * *"),
    MARKETPLACE_SYNC_LISTINGS_CRON: z.string().default("0 */4 * * *"),
    MARKETPLACE_SYNC_SETTLEMENTS_CRON: z.string().default("30 2 * * *"),
    MARKETPLACE_SYNC_CRON_TIMEZONE: z.string().default("Asia/Shanghai"),
    /** 收到 LAZOP push 后异步补单；默认开启。 */
    MARKETPLACE_WEBHOOK_SYNC_ENABLED: z
      .string()
      .optional()
      .default("true")
      .transform((value) => value !== "false" && value !== "0"),
    /** 仅本地联调使用：跳过 push 签名校验。生产禁止开启。 */
    MARKETPLACE_WEBHOOK_SKIP_VERIFY: z
      .string()
      .optional()
      .default("false")
      .transform((value) => value === "true" || value === "1"),
    /** Edge Agent REST API key（请求头 X-Agent-API-Key） */
    AGENT_API_KEY: z.string().min(1),
    /** Agent 二进制版本号（/version 与 CDN 路径） */
    AGENT_VERSION: z.string().min(1).default("1.0.0"),
    /** Agent 二进制 CDN 根 URL；未设置时 /downloads 返回 501 stub */
    AGENT_CDN_BASE_URL: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
