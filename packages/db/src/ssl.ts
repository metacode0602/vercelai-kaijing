/**
 * Postgres 连接串 TLS 策略统一解析。
 *
 * 背景：pg 8.x（pg-connection-string 2.x）会把连接串里的 sslmode=require/prefer/verify-ca
 * 当作 verify-full（严格校验证书链），且连接串参数会覆盖程序化传入的 ssl 配置；云端/池化代理
 * 常见的自签证书链会因此报 SELF_SIGNED_CERT_IN_CHAIN。这里统一收敛为三种明确模式，并把
 * 解析结果写回连接串，由 pg 自身生效：
 *   - disable     完全关闭 TLS
 *   - no-verify   开启 TLS 但不校验证书链（云端默认）
 *   - verify-full 开启 TLS 并严格校验
 */

export type PgSslMode = "disable" | "no-verify" | "verify-full"

const STRICT_ENV = new Set(["require", "required", "true", "1", "yes"])
const NOVERIFY_ENV = new Set(["noverify", "no-verify", "verify-none", "allow", "prefer"])
const DISABLE_ENV = new Set(["disable", "false", "0", "no", "none"])

const POSTGRES_URL = /^(postgres|postgresql):\/\//i

function extractHost(connectionString: string): string | undefined {
  const match = connectionString.match(/@([^:/@?#]+)/)
  return match?.[1]
}

function isLocalhost(host: string | undefined): boolean {
  if (!host) return false
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  )
}

/** 读取连接串自带的 sslmode / ssl 参数（小写），供 DATABASE_SSL 未显式指定时推断 */
function extractUrlSslMode(connectionString: string): string | undefined {
  if (!POSTGRES_URL.test(connectionString)) return undefined
  try {
    const params = new URL(connectionString).searchParams
    const mode = (params.get("sslmode") ?? params.get("ssl") ?? "").toLowerCase()
    return mode || undefined
  } catch {
    const match = connectionString.match(/[?&](?:sslmode|ssl)=([^&#\s]+)/)
    return match?.[1]?.toLowerCase()
  }
}

/**
 * 解析连接应使用的 sslmode。优先级：
 * 1) DATABASE_SSL 显式指定（require=严格校验 / noverify=加密不校验 / disable=关闭）
 * 2) 连接串自带 sslmode（libpq 语义：require/prefer=加密不校验；verify-full=校验）
 * 3) 主机推断：localhost 关闭，其余 no-verify
 */
export function resolvePgSslMode(connectionString: string): PgSslMode {
  const env = (process.env.DATABASE_SSL ?? "").trim().toLowerCase()
  if (STRICT_ENV.has(env)) return "verify-full"
  if (NOVERIFY_ENV.has(env)) return "no-verify"
  if (DISABLE_ENV.has(env)) return "disable"

  const urlMode = extractUrlSslMode(connectionString)
  if (urlMode) {
    if (DISABLE_ENV.has(urlMode)) return "disable"
    if (urlMode === "verify-full" || urlMode === "verify-ca") return "verify-full"
    return "no-verify"
  }

  return isLocalhost(extractHost(connectionString)) ? "disable" : "no-verify"
}

/**
 * 将解析出的 sslmode 写回连接串并中和 uselibpqcompat，保证 pg 按既定模式建连。
 * 只写入 disable / no-verify / verify-full，避免触发 pg-connection-string 对
 * require/prefer/verify-ca 的 verify-full 别名行为与弃用告警。
 */
export function applyPgSslMode(connectionString: string, mode: PgSslMode): string {
  if (!POSTGRES_URL.test(connectionString)) return connectionString
  try {
    const url = new URL(connectionString)
    url.searchParams.set("sslmode", mode)
    url.searchParams.delete("uselibpqcompat")
    return url.toString()
  } catch {
    let normalized = connectionString
    if (/[?&]uselibpqcompat=/.test(normalized)) {
      normalized = normalized.replace(/([?&])uselibpqcompat=[^&#\s]*/, "$1uselibpqcompat=false")
    }
    if (/[?&]sslmode=/.test(normalized)) {
      normalized = normalized.replace(/([?&])sslmode=[^&#\s]*/, `$1sslmode=${mode}`)
    } else {
      normalized += `${normalized.includes("?") ? "&" : "?"}sslmode=${mode}`
    }
    return normalized
  }
}
