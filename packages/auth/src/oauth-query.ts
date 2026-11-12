/** 判断当前 URL 是否处于 OAuth 授权续跑（带 signed query）。 */
export function isOAuthAuthorizeQuery(
  search: string | URLSearchParams | null | undefined,
): boolean {
  if (!search) return false
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search
  if (!params.get("client_id")) return false
  return Boolean(
    params.get("response_type") ||
      params.get("redirect_uri") ||
      params.get("code_challenge") ||
      params.get("sig"),
  )
}

export function oauthQueryFromSearch(
  search: string | URLSearchParams | null | undefined,
): string | undefined {
  if (!isOAuthAuthorizeQuery(search)) return undefined
  if (typeof search === "string") {
    return search.startsWith("?") ? search.slice(1) : search
  }
  return search?.toString()
}
