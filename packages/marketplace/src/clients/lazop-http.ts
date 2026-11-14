import { resolveFetch, type FetchLike } from "../fetch"
import { signLazopRequest } from "../signing/lazop"
import type { TokenProvider } from "../tokens/types"
import {
  resolveDarazRestBase,
  resolveLazadaRestBase,
  type DarazRegion,
  type LazadaRegion,
} from "../regions/endpoints"

export type LazopFamily = "daraz" | "lazada"

export interface LazopHttpClientOptions {
  family: LazopFamily
  region?: string
  appKey: string
  appSecret: string
  accessToken?: string
  /** Lazily resolves access tokens and force-refreshes on auth errors. */
  tokenProvider?: TokenProvider
  /** Override resolved REST base (include `/rest`). */
  baseUrl?: string
  fetchImpl?: FetchLike
}

export interface LazopCallOptions {
  method?: "GET" | "POST"
  /** API path relative to `/rest`, e.g. `/order/get` or `order/get`. */
  path: string
  params?: Record<string, string | number | boolean | undefined | null>
  /** Extra body fields for POST (form-urlencoded business params). */
  bodyParams?: Record<string, string | number | boolean | undefined | null>
}

export class LazopHttpError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly payload?: unknown,
  ) {
    super(message)
    this.name = "LazopHttpError"
  }
}

export function resolveLazopBaseUrl(
  family: LazopFamily,
  region?: string,
  override?: string,
): string {
  if (override) return override.replace(/\/+$/, "")
  if (family === "daraz") return resolveDarazRestBase(region)
  return resolveLazadaRestBase(region)
}

function isAuthFailure(status: number, json: unknown): boolean {
  if (status === 401 || status === 403) return true
  const code = String((json as { code?: string | number })?.code ?? "")
  if (code === "900") return true
  const message = String(
    (json as { message?: string; msg?: string })?.message ??
      (json as { msg?: string })?.msg ??
      "",
  )
  return /unauthori[sz]ed|invalid.*(access_?token|token)|token.*(expired|invalid)/i.test(
    message,
  )
}

export class LazopHttpClient {
  readonly family: LazopFamily
  readonly region: string
  readonly baseUrl: string
  private readonly appKey: string
  private readonly appSecret: string
  private accessToken?: string
  private readonly tokenProvider?: TokenProvider
  private readonly fetchImpl: FetchLike

  constructor(opts: LazopHttpClientOptions) {
    this.family = opts.family
    this.region = (opts.region ?? (opts.family === "daraz" ? "lk" : "sg")).toLowerCase()
    this.baseUrl = resolveLazopBaseUrl(opts.family, this.region, opts.baseUrl)
    this.appKey = opts.appKey
    this.appSecret = opts.appSecret
    this.accessToken = opts.accessToken
    this.tokenProvider = opts.tokenProvider
    this.fetchImpl = resolveFetch(opts.fetchImpl)
  }

  setAccessToken(token: string | undefined) {
    this.accessToken = token
  }

  async call<T = unknown>(options: LazopCallOptions): Promise<T> {
    return this.execute<T>(options, true)
  }

  private async execute<T>(
    options: LazopCallOptions,
    allowAuthRetry: boolean,
  ): Promise<T> {
    const method = options.method ?? "GET"
    const apiPath = options.path.startsWith("/") ? options.path : `/${options.path}`
    const timestamp = String(Date.now())

    const accessToken = this.tokenProvider
      ? await this.tokenProvider.getAccessToken()
      : this.accessToken

    const sys: Record<string, string> = {
      app_key: this.appKey,
      sign_method: "sha256",
      timestamp,
    }
    if (accessToken) {
      sys.access_token = accessToken
    }

    const business: Record<string, string> = {}
    for (const [k, v] of Object.entries(options.params ?? {})) {
      if (v !== undefined && v !== null) business[k] = String(v)
    }
    for (const [k, v] of Object.entries(options.bodyParams ?? {})) {
      if (v !== undefined && v !== null) business[k] = String(v)
    }

    const signParams = { ...sys, ...business }
    const sign = signLazopRequest(apiPath, signParams, this.appSecret)
    const query = new URLSearchParams({ ...sys, sign })

    let url = `${this.baseUrl}${apiPath}?${query.toString()}`
    let body: string | undefined
    const headers: Record<string, string> = {
      Accept: "application/json",
    }

    if (method === "POST") {
      const form = new URLSearchParams()
      for (const [k, v] of Object.entries(business)) {
        form.set(k, v)
      }
      body = form.toString()
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=utf-8"
    } else if (Object.keys(business).length > 0) {
      const q = new URLSearchParams({ ...sys, ...business, sign })
      url = `${this.baseUrl}${apiPath}?${q.toString()}`
    }

    const res = await this.fetchImpl(url, { method, headers, body })
    const text = await res.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      throw new LazopHttpError(`Invalid JSON from ${apiPath}`, "invalid_json", text)
    }

    const code = String((json as { code?: string | number })?.code ?? "")
    if (!res.ok || (code && code !== "0")) {
      if (
        allowAuthRetry &&
        this.tokenProvider &&
        isAuthFailure(res.status, json)
      ) {
        await this.tokenProvider.getAccessToken({ forceRefresh: true })
        return this.execute<T>(options, false)
      }

      const message =
        (json as { message?: string; msg?: string })?.message ??
        (json as { msg?: string })?.msg ??
        `LAZOP error ${code || res.status}`
      throw new LazopHttpError(message, code || String(res.status), json)
    }

    return json as T
  }
}

export type { DarazRegion, LazadaRegion }
