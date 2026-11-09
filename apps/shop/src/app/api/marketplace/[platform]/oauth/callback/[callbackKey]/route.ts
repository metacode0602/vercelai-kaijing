/**
 * Optional per-app callback:
 * `/api/marketplace/{platform}/oauth/callback/{callbackKey}`
 *
 * The handler validates the path key against `marketplace_app_credentials.callback_key`.
 */
export const runtime = 'nodejs'

export { GET } from '../route'
