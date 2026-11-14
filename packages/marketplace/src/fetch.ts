/**
 * Minimal structural fetch types.
 *
 * We intentionally avoid `typeof fetch` and the ambient `Response` type: some
 * toolchains (Vercel's Hono build, mixed @types/node/lib setups) resolve the
 * global `Response` to an empty interface, which makes `res.ok/status/text/json`
 * disappear. Depending only on the members we actually consume keeps this
 * package type-checkable in those environments.
 */
export interface FetchResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
}

export interface FetchInitLike {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export type FetchLike = (
  input: string,
  init?: FetchInitLike
) => Promise<FetchResponseLike>

export function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl
  return (input, init) => (fetch as unknown as FetchLike)(input, init)
}
