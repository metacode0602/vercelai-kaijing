/**
 * 生命周期状态数据迁移脚本
 *
 * 将 supplier_device.lifecycle_status 中的旧值（中文 / 'available' / 'offline'）
 * 迁移到统一英文值域：
 *   '在线' → 'online'
 *   '接入中' → 'onboarding'
 *   '维护中' → 'maintenance'
 *   '退订' → 'retired'
 *   '已退役' → 'retired'
 *   'available' → 'listed'
 *   'offline' → 'pending_onboarding'
 *
 * 同时迁移 entity_state_transition_log 和 supplier_device_change_log 中的
 * previous_lifecycle_status / new_lifecycle_status / from_state / to_state。
 *
 * 用法：
 *   DATABASE_URL=postgresql://... npx tsx packages/db/src/scripts/migrate-lifecycle-status.ts
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { eq, inArray, sql } from "drizzle-orm"
import { Pool } from "pg"
import { supplierDevice } from "../supply-schema"
import { entityStateTransitionLog } from "../supply-schema"

const OLD_TO_NEW: Record<string, string> = {
  // Chinese → English
  '在线': 'online',
  '接入中': 'onboarding',
  '维护中': 'maintenance',
  '退订': 'retired',
  '已退役': 'retired',
  '闲置寄存': 'pending_onboarding',
  '离线': 'pending_onboarding',
  // Old English seed values
  'available': 'listed',
  'offline': 'pending_onboarding',
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://cloud:cloud@localhost:5432/cloud"
  if (!databaseUrl) {
    console.error("DATABASE_URL not set")
    process.exit(1)
  }

  console.log("=".repeat(60))
  console.log("  Lifecycle Status Migration")
  console.log("=".repeat(60))

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool, logger: false })

  try {
    // 1. Find all distinct lifecycle_status values in supplier_device
    const distinctResult = await db
      .select({ value: sql<string>`distinct lifecycle_status` })
      .from(supplierDevice)

    const existingValues = distinctResult.map(r => r.value)
    console.log("\nExisting lifecycle_status values in DB:")
    for (const v of existingValues) {
      const mapped = OLD_TO_NEW[v]
      console.log(`  ${v} → ${mapped ?? '(already unified, skipping)'}`)
    }

    // 2. Migrate supplier_device.lifecycle_status
    let migratedCount = 0
    for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW)) {
      if (!existingValues.includes(oldVal)) continue

      const result = await db
        .update(supplierDevice)
        .set({ lifecycleStatus: newVal, updatedAt: new Date() })
        .where(eq(supplierDevice.lifecycleStatus, oldVal))

      if (result.rowCount && result.rowCount > 0) {
        migratedCount += result.rowCount
        console.log(`  Migrated ${result.rowCount} devices: ${oldVal} → ${newVal}`)
      }
    }
    console.log(`\n✅ supplier_device: ${migratedCount} rows migrated`)

    // 3. Migrate entity_state_transition_log.from_state and to_state
    let logMigratedCount = 0
    for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW)) {
      // from_state
      const fromResult = await db
        .update(entityStateTransitionLog)
        .set({ fromState: newVal })
        .where(eq(entityStateTransitionLog.fromState, oldVal))

      if (fromResult.rowCount && fromResult.rowCount > 0) {
        logMigratedCount += fromResult.rowCount
      }

      // to_state
      const toResult = await db
        .update(entityStateTransitionLog)
        .set({ toState: newVal })
        .where(eq(entityStateTransitionLog.toState, oldVal))

      if (toResult.rowCount && toResult.rowCount > 0) {
        logMigratedCount += toResult.rowCount
      }
    }
    console.log(`✅ entity_state_transition_log: ${logMigratedCount} entries migrated`)

    console.log("\n" + "=".repeat(60))
    console.log("  Migration complete!")
    console.log("=".repeat(60))
  } catch (error) {
    console.error("\n❌ Migration failed:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error("Uncaught error:", err)
  process.exit(1)
})
