/**
 * 定价建议草稿版本规划：只追加新版本，把旧的 current 标为 superseded；归档为软删除。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md §12.3
 */

export type PricingDraftStatus = 'current' | 'superseded' | 'archived'

export type PricingDraftVersionRow = {
  id: string
  versionNo: number
  status: PricingDraftStatus
}

export function planDraftSave(existing: PricingDraftVersionRow[]): {
  nextVersionNo: number
  supersedeIds: string[]
} {
  const active = existing.filter((row) => row.status !== 'archived')
  const nextVersionNo = existing.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1
  const supersedeIds = active.filter((row) => row.status === 'current').map((row) => row.id)
  return { nextVersionNo, supersedeIds }
}

export function planDraftArchive(existing: PricingDraftVersionRow[]): {
  archiveIds: string[]
} {
  return {
    archiveIds: existing.filter((row) => row.status !== 'archived').map((row) => row.id),
  }
}

export function assertHistoryPreserved(
  before: PricingDraftVersionRow[],
  after: PricingDraftVersionRow[],
): void {
  const beforeIds = new Set(before.map((row) => row.id))
  for (const id of beforeIds) {
    if (!after.some((row) => row.id === id)) {
      throw new Error(`历史草稿 ${id} 被删除，禁止覆盖或硬删除`)
    }
  }
}
