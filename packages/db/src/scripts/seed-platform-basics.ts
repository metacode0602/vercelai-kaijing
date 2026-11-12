/**
 * 种子 / 回补：平台目录（基础资料、字典、内部品类树、承运商名称、导入模板）。
 *
 * 两步都幂等：
 * 1. 补齐各平台目录中缺失的默认行（不覆盖平台已维护内容）；
 * 2. 把目录中的有效项初始化到已入驻通过的 tenant 组织（只补缺失，不覆盖）。
 *
 * 新审核通过的企业由审核事务自动执行；本脚本用于回补存量已通过组织与本地开发库。
 *
 * 用法（仓库根）：
 *   pnpm --filter @workspace/db db:seed:platform-basics
 *   SHOP_DEV_ORGANIZATION_ID=<orgId> pnpm --filter @workspace/db db:seed:platform-basics
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import { organization } from '../schema'
import { ensureAllPlatformCatalogs, initializeOrganizationCatalogs } from '../platform-catalogs'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

async function main() {
  const { db, pool } = createPgClient()
  try {
    const catalog = await ensureAllPlatformCatalogs(db)
    console.log(
      `平台目录：基础资料 ${catalog.platformBasics}，字典 ${catalog.dictionaries}，品类 ${catalog.categories}，承运商 ${catalog.carriers}，导入模板 ${catalog.importTemplates}`,
    )

    const targetOrgId = process.env.SHOP_DEV_ORGANIZATION_ID?.trim()
    const orgs = targetOrgId
      ? await db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(eq(organization.id, targetOrgId))
      : await db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(and(eq(organization.orgType, 'tenant'), eq(organization.entryApproved, true)))

    if (orgs.length === 0) {
      if (targetOrgId) {
        throw new Error(`组织不存在：${targetOrgId}`)
      }
      console.log('未找到已通过入驻的 tenant 组织，仅补齐了平台目录。')
      return
    }

    for (const org of orgs) {
      const result = await initializeOrganizationCatalogs(db, org.id)
      console.log(
        `${org.name} (${org.id})：基础资料 ${result.platformBasics}，字典 ${result.dictionaries}，品类 ${result.categories}，承运商 ${result.carriers}，导入模板 ${result.importTemplates}，税则 ${result.hsTariffs}，费用模板 ${result.feeTemplates}，组织偏好 ${result.organizationSettings}`,
      )
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
