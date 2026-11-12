/**
 * 种子：从平台字典目录补齐租户 commerce_dictionaries。
 * 默认初始化已通过入驻的 tenant 组织；可用 SHOP_DEV_ORGANIZATION_ID 限定单个组织。
 * 幂等：只补缺失 key，不覆盖已有字典（含租户已改的履约模式 / 仓库类型）。
 *
 *   pnpm --filter @workspace/db db:seed:dictionaries
 *
 * 完整目录回补（含基础资料、品类树等）请用 db:seed:platform-basics。
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import { organization } from '../schema'
import {
  ensurePlatformDictionariesCatalog,
  initializeDictionariesForOrganization,
} from '../platform-catalogs'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

async function main() {
  const { db, pool } = createPgClient()
  try {
    const catalog = await ensurePlatformDictionariesCatalog(db)
    console.log(`平台字典目录：补齐 ${catalog.inserted} 条默认字典`)

    const targetOrgId = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
    const orgs = targetOrgId
      ? await db.select({ id: organization.id, name: organization.name }).from(organization).where(eq(organization.id, targetOrgId))
      : await db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(and(eq(organization.orgType, 'tenant'), eq(organization.entryApproved, true)))

    if (orgs.length === 0) {
      throw new Error(
        targetOrgId ? `组织不存在：${targetOrgId}` : '未找到已通过入驻的 tenant 组织，请先完成入驻审核或设置 SHOP_DEV_ORGANIZATION_ID',
      )
    }

    for (const org of orgs) {
      const result = await initializeDictionariesForOrganization(db, org.id)
      console.log(`${org.name} (${org.id}): 新增 ${result.inserted} 个字典`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
