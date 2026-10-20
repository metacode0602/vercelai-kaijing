import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { canManageSupply } from '@/lib/auth/app-role'

/**
 * 发票附件（PDF / 图片）上传与下载的访问守卫。
 *
 * 与 tRPC `supplyProcedure` 保持同一套角色口径：必须登录，且角色为
 * admin / member（`canManageSupply`）。tRPC 中间件只保护 procedure，
 * 保护不到 `/api/v1/upload-invoice` 与 `/api/v1/invoice-files/*` 这两条
 * App Router 路由 —— 这两条必须自行鉴权。
 */
export async function guardInvoiceFileAccess(
  request: Request,
): Promise<NextResponse | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  if (!canManageSupply(session.user.role)) {
    return NextResponse.json({ error: '暂无供应链访问权限' }, { status: 403 })
  }
  return null
}
