import { signTiktokRequest } from "../signing/tiktok"
import { resolveTiktokEndpoints, type TiktokRegion } from "../regions/endpoints"

export interface TiktokHttpClientOptions {
  region?: string
  appKey: string
  appSecret: string
  accessToken?: string
  shopCipher?: string
  apiBase?: string
  fetchImpl?: typeof fetch
}

export interface TiktokCallOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  /** Exact path including version, e.g. `/product/202309/products/search`. */
  path: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
}

export class TiktokHttpError extends Error {
  constructor(
    message: string,
    readonly code?: number | string,
    readonly payload?: unknown,
  ) {
    super(message)
    this.name = "TiktokHttpError"
  }
}

export class TiktokHttpClient {
  readonly region: string
  readonly apiBase: string
  private readonly appKey: string
  private readonly appSecret: string
  private accessToken?: string
  private shopCipher?: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: TiktokHttpClientOptions) {
    this.region = (opts.region ?? "global").toLowerCase()
    const endpoints = resolveTiktokEndpoints(this.region)
    this.apiBase = (opts.apiBase ?? endpoints.apiBase).replace(/\/+$/, "")
    this.appKey = opts.appKey
    this.appSecret = opts.appSecret
    this.accessToken = opts.accessToken
    this.shopCipher = opts.shopCipher
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  setAccessToken(token: string | undefined) {
    this.accessToken = token
  }

  setShopCipher(cipher: string | undefined) {
    this.shopCipher = cipher
  }

  async call<T = unknown>(options: TiktokCallOptions): Promise<T> {
    const method = options.method ?? "GET"
    const path = options.path.startsWith("/") ? options.path : `/${options.path}`
    const timestamp = String(Math.floor(Date.now() / 1000))

    const query: Record<string, string> = {
      app_key: this.appKey,
      timestamp,
    }
    if (this.shopCipher) {
      query.shop_cipher = this.shopCipher
    }
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined && v !== null) query[k] = String(v)
    }

    const bodyStr =
      options.body === undefined || options.body === null
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body)

    const sign = signTiktokRequest(path, query, this.appSecret, bodyStr)
    query.sign = sign

    const url = `${this.apiBase}${path}?${new URLSearchParams(query).toString()}`
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    }
    if (this.accessToken) {
      headers["x-tts-access-token"] = this.accessToken
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: method === "GET" || method === "DELETE" ? undefined : bodyStr,
    })
    const text = await res.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      throw new TiktokHttpError(`Invalid JSON from ${path}`, "invalid_json", text)
    }

    const code = (json as { code?: number })?.code
    if (!res.ok || (code !== undefined && code !== 0)) {
      const message =
        (json as { message?: string })?.message ?? `TikTok error ${code ?? res.status}`
      throw new TiktokHttpError(message, code ?? res.status, json)
    }

    return json as T
  }
}

export type { TiktokRegion }
