/**
 * 平台管理员初始化脚本
 *
 * 交互模式：
 *   DATABASE_URL=postgresql://... npx tsx packages/db/src/scripts/platform-admin-init.ts
 *
 * 非交互模式：
 *   DATABASE_URL=postgresql://... ADMIN_PASSWORD=xxx NON_INTERACTIVE=true \
 *     npx tsx packages/db/src/scripts/platform-admin-init.ts
 *
 * 环境变量（非交互模式）：
 *   ADMIN_EMAIL        管理员邮箱（默认 admin@gpurun.cn）
 *   ADMIN_NAME         管理员姓名（默认 平台管理员）
 *   ADMIN_EMPLOYEE_NO  工号（默认 ADMIN001）
 *   ADMIN_PASSWORD     密码（留空自动生成）
 *
 * 前置条件：
 *   - 数据库 migration 已完成（所有表已创建）
 *
 * 本脚本会：
 *   1. 生成平台管理员用户（users、account）
 *   2. 创建平台管理组织（organization）
 *   3. 建立组织成员关系（member）
 *   4. 创建员工记录（user_staff）
 */

import { createId } from "@paralleldrive/cuid2"
import { randomBytes, scryptSync } from "node:crypto"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

// 导入 schema（使用相对路径避免循环引用）
import {
  user,
  account,
  organization,
  member,
  userStaff,
} from "../schema"

// =============================================================================
// 配置 — 根据实际情况修改
// =============================================================================

const PHONE_NUMBER = "13681332233"

// =============================================================================
// 主逻辑
// =============================================================================

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://cloud:cloud@localhost:5432/cloud"
  if (!databaseUrl) {
    console.error("错误：DATABASE_URL 环境变量未设置")
    process.exit(1)
  }

  const nonInteractive = process.env.NON_INTERACTIVE === "true" || process.env.CI === "true"

  // ---- 获取配置 ----
  let adminEmail: string
  let adminName: string
  let adminEmployeeNo: string
  let adminPassword: string
  let confirmed = true

  if (nonInteractive) {
    adminEmail = process.env.ADMIN_EMAIL || "admin@gpurun.cn"
    adminName = process.env.ADMIN_NAME || "平台管理员"
    adminEmployeeNo = process.env.ADMIN_EMPLOYEE_NO || "ADMIN001"
    adminPassword = process.env.ADMIN_PASSWORD || generatePassword(16)

    console.log("=".repeat(60))
    console.log("  GPURun Cloud — 平台管理员初始化（非交互模式）")
    console.log("=".repeat(60))
    console.log(`  手机号:     ${PHONE_NUMBER}`)
    console.log(`  邮箱:       ${adminEmail}`)
    console.log(`  姓名:       ${adminName}`)
    console.log(`  工号:       ${adminEmployeeNo}`)
    console.log(`  密码:       ${adminPassword}`)
    console.log("=".repeat(60))
  } else {
    const rl = readline.createInterface({ input, output })

    console.log("=".repeat(60))
    console.log("  GPURun Cloud — 平台管理员初始化")
    console.log("=".repeat(60))

    const email = await rl.question("管理员邮箱（默认 admin@gpurun.cn）: ")
    adminEmail = email.trim() || "admin@gpurun.cn"

    const displayName = await rl.question("管理员姓名（默认 平台管理员）: ")
    adminName = displayName.trim() || "平台管理员"

    const employeeNo = await rl.question("工号（默认 ADMIN001）: ")
    adminEmployeeNo = employeeNo.trim() || "ADMIN001"

    const password = await rl.question("管理员密码（留空自动生成）: ")
    adminPassword = password || generatePassword(16)

    console.log("\n" + "-".repeat(60))
    console.log("确认信息：")
    console.log(`  手机号:     ${PHONE_NUMBER}`)
    console.log(`  邮箱:       ${adminEmail}`)
    console.log(`  姓名:       ${adminName}`)
    console.log(`  工号:       ${adminEmployeeNo}`)
    console.log(`  密码:       ${adminPassword}`)
    console.log("-".repeat(60))

    const answer = await rl.question("确认执行？(yes/no) ")
    confirmed = answer.toLowerCase() === "yes" || answer.toLowerCase() === "y"
    rl.close()
  }

  if (!confirmed) {
    console.log("已取消")
    process.exit(0)
  }

  // ---- 生成 ID ----
  const USER_ID = createId()
  const ACCOUNT_ID = createId()
  const ORG_ID = createId()
  const MEMBER_ID = createId()
  const STAFF_ID = createId()

  console.log("\n正在初始化...")

  // ---- 数据库连接 ----
  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool, logger: false })

  try {
    await db.transaction(async (tx) => {
      // 1. 生成兼容 better-auth 的密码哈希（scrypt: salt:hexkey）
      const hashSalt = randomBytes(16).toString("hex")
      const hashKey = scryptSync(adminPassword.normalize("NFKC"), hashSalt, 64, {
        N: 16384,
        r: 16,
        p: 1,
        maxmem: 128 * 16384 * 16 * 2,
      })
      const passwordHash = `${hashSalt}:${hashKey.toString("hex")}`

      // 2. 创建 auth 用户
      await tx.insert(user).values({
        id: USER_ID,
        name: adminName,
        email: adminEmail,
        emailVerified: true,
        phoneNumber: PHONE_NUMBER,
        phoneNumberVerified: true,
        role: "admin",
        mustChangePassword: true,
        provisionedBy: "INIT",
        provisionedAt: new Date(),
        banned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // 3. 创建 credential account
      await tx.insert(account).values({
        id: ACCOUNT_ID,
        accountId: adminEmail,
        providerId: "credential",
        userId: USER_ID,
        password: passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // 4. 创建平台管理组织
      await tx.insert(organization).values({
        id: ORG_ID,
        name: "平台管理组织",
        slug: "platform",
        orgType: "platform",
        status: "active",
        entryApproved: true,
        isCurrent: true,
        createdAt: new Date(),
      })

      // 5. 创建组织成员关系
      await tx.insert(member).values({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        role: "platform_admin",
        createdAt: new Date(),
      })

      // 6. 创建员工记录
      await tx.insert(userStaff).values({
        id: STAFF_ID,
        employeeNo: adminEmployeeNo,
        displayName: adminName,
        mobile: PHONE_NUMBER,
        email: adminEmail,
        status: "active",
        department: "管理",
        position: "管理员",
        roles: ["admin"],
        authUserId: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    console.log("\n✅ 初始化成功！")
    console.log("=".repeat(60))
    console.log("  用户 ID:     ", USER_ID)
    console.log("  账号 ID:     ", ACCOUNT_ID)
    console.log("  组织 ID:     ", ORG_ID)
    console.log("  成员 ID:     ", MEMBER_ID)
    console.log("  员工 ID:     ", STAFF_ID)
    console.log("=".repeat(60))
    console.log("\n登录信息：")
    console.log(`  邮箱:        ${adminEmail}`)
    console.log(`  手机号:      ${PHONE_NUMBER}`)
    console.log(`  密码:        ${adminPassword}`)
    console.log("\n⚠️  首次登录后系统将要求修改密码！")
    console.log("\n验证查询：")
    console.log(`  SELECT id, email, role, email_verified, must_change_password FROM users WHERE email = '${adminEmail}';`)
    console.log("")
    console.log("  SELECT o.name, o.org_type, m.role, u.email")
    console.log("  FROM member m")
    console.log("  JOIN organization o ON o.id = m.organization_id")
    console.log("  JOIN users u ON u.id = m.user_id")
    console.log("  WHERE o.org_type = 'platform';")
    console.log("")
    console.log(`  SELECT id, display_name, email, roles FROM user_staff WHERE email = '${adminEmail}';`)
  } catch (error) {
    console.error("\n❌ 初始化失败：", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// =============================================================================
// 工具函数
// =============================================================================

function generatePassword(length: number): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const lower = "abcdefghijklmnopqrstuvwxyz"
  const digits = "0123456789"
  const special = "!@#$%^&*"
  const all = upper + lower + digits + special

  const parts = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ]

  for (let i = parts.length; i < length; i++) {
    parts.push(all[Math.floor(Math.random() * all.length)])
  }

  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[parts[i], parts[j]] = [parts[j], parts[i]]
  }

  return parts.join("")
}

// =============================================================================
// 启动
// =============================================================================

main().catch((err) => {
  console.error("未捕获的错误：", err)
  process.exit(1)
})
