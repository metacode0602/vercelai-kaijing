export const FEDERATION_TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange"

export const FEDERATION_JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt"
export const FEDERATION_ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token"
export const FEDERATION_SUBJECT_TOKEN_USE = "federation_subject"
export const FEDERATION_ACTOR_TOKEN_USE = "federation_actor"
export const FEDERATION_DEFAULT_ACTOR_SUBJECT = "service:openmcp-federation"
export const FEDERATION_MAX_TOKEN_TTL_SECONDS = 600
export const FEDERATION_CLOCK_SKEW_SECONDS = 30

/** Stable federation client id: `openmcp-<externalOrgId>`, verbatim. */
export function federationClientId(externalOrgId: string): string {
  return `openmcp-${externalOrgId}`
}
