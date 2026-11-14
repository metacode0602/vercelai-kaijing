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
  /*
   * 纯服务端应用，不暴露客户端变量。显式声明空前缀与空 client，
   * 避免 createEnv 在某些环境下把 TPrefix 推断为 string 而报错。
   */
  clientPrefix: "",
  client: {},
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
    /** 售后逆向单同步 cron（拉取建档 + 策略释放 / 排期）。 */
    MARKETPLACE_SYNC_REVERSE_CRON_ENABLED: z
      .string()
      .optional()
      .default("true")
      .transform((value) => value !== "false" && value !== "0"),
    MARKETPLACE_SYNC_REVERSE_CRON: z.string().default("*/15 * * * *"),
    /** 到期退款决定 cron。 */
    MARKETPLACE_SYNC_REVERSE_DECIDE_CRON: z.string().default("*/10 * * * *"),
    MARKETPLACE_SYNC_CRON_TIMEZONE: z.string().default("Asia/Shanghai"),
    /** 订单履约异常扫描 cron（apps/api 后台扫描，不依赖 shop） */
    ORDER_EXCEPTIONS_SCAN_CRON: z.string().default("15 * * * *"),
    ORDER_EXCEPTIONS_SCAN_CRON_ENABLED: z
      .string()
      .optional()
      .default("true")
      .transform((value) => value !== "false" && value !== "0"),
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
    /**
     * Desktop MCP 宿主开关。默认关闭。
     * 与组织级 mcp_workbench_enabled 同时打开后才会对外提供 /mcp 工具（S3）。
     */
    OPENSHOP_MCP_ENABLED: z
      .string()
      .optional()
      .default("false")
      .transform((value) => value === "true" || value === "1"),
    /** MCP 资源标识，须与 shop 授权服务器 resources 一致。 */
    OPENSHOP_MCP_RESOURCE: z.url().optional(),
    /** Shop 授权服务器 issuer（用于后续内省）。 */
    OPENSHOP_OAUTH_ISSUER: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

// C3/C5 防呆：打开 MCP 时必须显式声明公网资源 URL。
// Den 按 RFC 9728 做字符串完全相等校验，默认值 https://localhost/mcp 会导致线上 401 指错元数据。
if (env.OPENSHOP_MCP_ENABLED && !env.OPENSHOP_MCP_RESOURCE) {
  throw new Error(
    "OPENSHOP_MCP_ENABLED=true 时必须同时配置 OPENSHOP_MCP_RESOURCE（MCP 公网 URL，须与 Den 连接的 serverUrl 完全一致，例如 https://api.example.com/mcp）",
  )
}
