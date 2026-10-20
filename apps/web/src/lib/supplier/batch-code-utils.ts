import type { OnboardingBatchKind } from '@/lib/types/supplier-domain'

function resolveBatchCodePrefix(batchKind: OnboardingBatchKind): string {
  switch (batchKind) {
    case 'device_inventory':
      return 'DINV'
    case 'device_changelog':
      return 'DCHG'
    case 'device_retire':
      return 'RET'
    case 'internal_occupancy':
      return 'IO'
    case 'platform_orphan_import':
      return 'OIMP'
    case 'online':
      return 'ONB'
    case 'order_access':
      return 'ORD'
    default:
      return 'BAT'
  }
}

/** 生成全局唯一的 onboarding / 导入批次号（onboarding_batch.batch_code UK） */
export function generateBatchCode(batchKind: OnboardingBatchKind, now = new Date()): string {
  const prefix = resolveBatchCodePrefix(batchKind)
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const suffix = [
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
    String(now.getMilliseconds()).padStart(3, '0'),
    String(Math.floor(Math.random() * 1000)).padStart(3, '0'),
  ].join('')
  return `${prefix}-${y}${m}-${suffix}`
}
