'use client'

import { AUTH_PATH } from '@/lib/auth/constants'
import { oauthQueryFromSearch } from '@workspace/auth/oauth-query'

export async function continueOAuthAuthorization(
  body: {
    postLogin?: boolean
    selected?: boolean
    created?: boolean
  } = {},
): Promise<{ url: string }> {
  const oauthQuery = oauthQueryFromSearch(window.location.search)
  const response = await fetch(`${AUTH_PATH}/oauth2/continue`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
    }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    url?: string
    error?: string
    message?: string
  }
  if (!response.ok || !data.url) {
    throw new Error(data.message || data.error || '无法继续授权，请重试')
  }
  return { url: data.url }
}

export async function submitOAuthConsent(input: {
  accept: boolean
  scope?: string
}): Promise<{ url: string }> {
  const oauthQuery = oauthQueryFromSearch(window.location.search)
  const response = await fetch(`${AUTH_PATH}/oauth2/consent`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accept: input.accept,
      scope: input.scope,
      ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
    }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    url?: string
    error?: string
    message?: string
    error_description?: string
  }
  if (!response.ok || !data.url) {
    throw new Error(data.error_description || data.message || data.error || '授权处理失败，请重试')
  }
  return { url: data.url }
}
