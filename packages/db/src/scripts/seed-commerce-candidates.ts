/**
 * 种子：候选选品 + 站内信（模块14）。
 * 依赖：组织；建议先跑 commerce-products。
 *
 *   pnpm --filter @workspace/db db:seed:commerce-products
 *   pnpm --filter @workspace/db db:seed:commerce-candidates
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  consoleNotifications,
  organization,
  pendingActions,
  productCandidates,
} from '../schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const ORG_ID = process.env.SHOP_DEV_ORGANIZATION_ID?.trim() || 'org_shop_dev_demo'

async function main() {
  const { db, pool } = createPgClient()
  try {
    const [org] = await db.select().from(organization).where(eq(organization.id, ORG_ID)).limit(1)
    if (!org) throw new Error(`组织不存在：${ORG_ID}。请先 seed products 或创建组织。`)

    const candidates = [
      {
        key: 'seed-cand-tee',
        title: 'Oversized Cotton Tee（手工候选）',
        categoryHint: 'Apparel',
        url: 'https://example.com/manual/tee',
        source: 'manual',
        score: '0.8800',
        status: 'new',
        rationale: {
          goNoGo: 'GO',
          currency: 'USD',
          landedCost: 5.6,
          suggestPrice: 12.5,
          marginPct: 38,
          competition: '中',
          risk: '低',
          marketPotential: '手工录入示例',
          evidenceLabel: '手工录入 · 非爬虫',
          evidenceStatus: 'manual',
        },
      },
      {
        key: 'seed-cand-hub',
        title: 'USB-C Hub 7-in-1（导入候选）',
        categoryHint: 'Electronics',
        url: '',
        source: 'import',
        score: '0.7600',
        status: 'new',
        rationale: {
          goNoGo: 'HOLD',
          currency: 'USD',
          landedCost: 12.3,
          suggestPrice: 24,
          marginPct: 32,
          competition: '高',
          risk: '中',
          marketPotential: '导入批次示例',
          evidenceLabel: '批量导入 · 非爬虫',
          evidenceStatus: 'import',
        },
      },
      {
        key: 'seed-cand-mat',
        title: 'Yoga Mat Pro（已拒绝示例）',
        categoryHint: 'Sports',
        url: '',
        source: 'manual',
        score: '0.6100',
        status: 'rejected',
        rejectReason: '库龄风险偏高，暂不开发',
        rationale: {
          goNoGo: 'NO_GO',
          currency: 'USD',
          landedCost: 8.1,
          suggestPrice: 18.9,
          marginPct: 29,
          evidenceLabel: '手工录入 · 非爬虫',
        },
      },
    ] as const

    for (const seed of candidates) {
      const [existing] = await db
        .select()
        .from(productCandidates)
        .where(
          and(
            eq(productCandidates.organizationId, ORG_ID),
            eq(productCandidates.title, seed.title),
          ),
        )
        .limit(1)
      if (existing) {
        console.log('skip candidate', seed.title)
        continue
      }
      const id = createId()
      const actionId = createId()
      const now = new Date()
      await db.insert(pendingActions).values({
        id: actionId,
        organizationId: ORG_ID,
        kind: 'candidate_review',
        status: seed.status === 'rejected' ? 'rejected' : 'pending',
        title: `选品审核 · ${seed.title}`,
        payload: { candidateKey: seed.key, source: seed.source },
        idempotencyKey: `seed:candidate:${seed.key}`,
        createdBy: 'seed',
        error: 'rejectReason' in seed ? seed.rejectReason : null,
        confirmedBy: seed.status === 'rejected' ? 'seed' : null,
        confirmedAt: seed.status === 'rejected' ? now : null,
      })
      await db.insert(productCandidates).values({
        id,
        organizationId: ORG_ID,
        title: seed.title,
        url: seed.url || null,
        categoryHint: seed.categoryHint,
        score: seed.score,
        rationale: seed.rationale,
        status: seed.status,
        source: seed.source,
        rejectReason: 'rejectReason' in seed ? seed.rejectReason : null,
        pendingActionId: actionId,
        reviewedBy: seed.status === 'rejected' ? 'seed' : null,
        reviewedAt: seed.status === 'rejected' ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      console.log('inserted candidate', seed.title)
    }

    const notifs = [
      {
        key: 'seed-notif-welcome',
        category: 'system',
        title: '站内信已启用',
        summary: 'console_notifications 已接库，不自动外传',
        body: '同步任务与订单异常扫描可写入系统通知。',
        href: '/console/dashboard',
      },
      {
        key: 'seed-notif-candidate',
        category: 'sourcing',
        title: '有新的选品候选待审',
        summary: '请到 AI 选品列表审核手工/导入候选',
        body: '通过可创建 SPU 草稿；拒绝须填理由。',
        href: '/console/candidates',
      },
      {
        key: 'seed-notif-sync',
        category: 'system',
        title: '同步任务示例通知',
        summary: '仅站内信，未调真实平台',
        body: '来自 seed，演示未读角标。',
        href: '/console/sync-tasks',
      },
    ]

    for (const n of notifs) {
      const [existing] = await db
        .select()
        .from(consoleNotifications)
        .where(
          and(
            eq(consoleNotifications.organizationId, ORG_ID),
            eq(consoleNotifications.sourceType, 'seed'),
            eq(consoleNotifications.sourceId, n.key),
          ),
        )
        .limit(1)
      if (existing) {
        console.log('skip notif', n.key)
        continue
      }
      await db.insert(consoleNotifications).values({
        id: createId(),
        organizationId: ORG_ID,
        userId: null,
        category: n.category,
        title: n.title,
        summary: n.summary,
        body: n.body,
        href: n.href,
        sourceType: 'seed',
        sourceId: n.key,
      })
      console.log('inserted notif', n.key)
    }

    console.log('seed-commerce-candidates done')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
