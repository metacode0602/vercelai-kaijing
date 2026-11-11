/**
 * 种子：平台基础资料（平台 / 国家站点 / 币种）。
 *
 * 两步都幂等：
 * 1. 补齐平台目录 `platform_basics_catalog`（只补缺失的 kind+code，不覆盖平台已维护行）；
 * 2. 把目录初始化到 tenant 组织的 `commerce_platform_basics`（新审核通过的企业由
 *    审核事务自动执行，此处回补存量组织与本地开发库）。
 *
 * 用法（仓库根）：
 *   pnpm --filter @workspace/db db:seed:platform-basics
 *   SHOP_DEV_ORGANIZATION_ID=<orgId> pnpm --filter @workspace/db db:seed:platform-basics
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import { organization } from '../schema'
import {
  ensurePlatformBasicsCatalog,
  initializePlatformBasicsForOrganization,
} from '../platform-basics'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

async function main() {
  const { db, pool } = createPgClient()
  try {
    const catalog = await ensurePlatformBasicsCatalog(db)
    console.log(`平台目录：补齐 ${catalog.inserted} 条默认资料`)

    const targetOrgId = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
    const orgs = targetOrgId
      ? await db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(eq(organization.id, targetOrgId))
      : await db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(eq(organization.orgType, 'tenant'))

    if (orgs.length === 0) {
      throw new Error(
        targetOrgId
          ? `组织不存在：${targetOrgId}`
          : '未找到 tenant 组织，请先完成入驻或设置 SHOP_DEV_ORGANIZATION_ID',
      )
    }

    for (const org of orgs) {
      const result = await initializePlatformBasicsForOrganization(db, org.id)
      console.log(`${org.name} (${org.id})：初始化 ${result.inserted} 条`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
