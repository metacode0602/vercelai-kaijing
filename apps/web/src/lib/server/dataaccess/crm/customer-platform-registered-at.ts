import { customer } from '@workspace/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

/** 兼容 db / transaction 的最小 update 接口 */
type DbLike = {
  update: typeof import('@/lib/db').db.update
}

/**
 * 客户尚无平台注册时间时写入（首个租户导入场景）。
 * 已有值则不覆盖。
 */
export async function writeCustomerPlatformRegisteredAtIfEmpty(
  tx: DbLike,
  customerId: string,
  platformRegisteredAt: Date | null | undefined,
): Promise<void> {
  if (!platformRegisteredAt) return
  await tx
    .update(customer)
    .set({ platformRegisteredAt })
    .where(and(eq(customer.id, customerId), isNull(customer.platformRegisteredAt)))
}
