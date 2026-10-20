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
    /** Edge Agent REST API key（请求头 X-Agent-API-Key） */
    AGENT_API_KEY: z.string().min(1),
    /** Agent 二进制版本号（/version 与 CDN 路径） */
    AGENT_VERSION: z.string().min(1).default('1.0.0'),
    /** Agent 二进制 CDN 根 URL；未设置时 /downloads 返回 501 stub */
    AGENT_CDN_BASE_URL: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
