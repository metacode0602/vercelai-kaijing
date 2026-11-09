import { normalizeAppRole } from '@/lib/auth/app-role'
import { isPlatformAdminUserId } from '@/lib/auth/platform-admin'
import { auth } from '@/lib/auth'

/**
 * 从请求中创建 tRPC 上下文
 */
export const createContextFromRequest = async (req: Request) => {
  const authSession = await auth.api.getSession({
    headers: req.headers,
  })

  const sessionUser = authSession?.user as
    | { id: string; role?: string | null }
    | undefined

  const user = sessionUser
    ? {
        id: sessionUser.id,
        role: normalizeAppRole(sessionUser.role) ?? sessionUser.role,
      }
    : null

  const isPlatformAdmin = sessionUser
    ? await isPlatformAdminUserId(sessionUser.id)
    : false

  return { user, isPlatformAdmin }
}

export type TRPCContext = Awaited<ReturnType<typeof createContextFromRequest>>
