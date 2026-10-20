/** 平台孤儿导入 — 展示常量（UED / 后续 API 共用） */

export type OrphanImportMatchField =
  | 'k8s_device_name'
  | 'sn'
  | 'internal_ip'
  | 'proxy_platform_device_id'
  | 'bare_metal_order_no'

export type OrphanImportMatchOperator =
  | 'prefix'
  | 'prefix_ignore_case'
  | 'suffix'
  | 'contains'
  | 'exact'
  | 'regex'

export type OrphanImportPresenceChannel = 'any' | 'k8s_only' | 'proxy_only'

export type OrphanImportPreviewAction = 'create' | 'skip' | 'error' | 'unmatched'

export const ORPHAN_IMPORT_MATCH_FIELD_LABELS: Record<OrphanImportMatchField, string> = {
  k8s_device_name: 'K8s device_name',
  sn: 'SN',
  internal_ip: '内网 IP',
  proxy_platform_device_id: '接入端平台设备 ID',
  bare_metal_order_no: '裸金属订单号',
}

export const ORPHAN_IMPORT_MATCH_OPERATOR_LABELS: Record<OrphanImportMatchOperator, string> = {
  prefix: '前缀匹配',
  prefix_ignore_case: '前缀匹配（忽略大小写）',
  suffix: '后缀匹配',
  contains: '包含',
  exact: '完全相等',
  regex: '正则表达式',
}

export const ORPHAN_IMPORT_PRESENCE_CHANNEL_LABELS: Record<OrphanImportPresenceChannel, string> = {
  any: '不限通道',
  k8s_only: '仅 K8s 孤儿',
  proxy_only: '仅接入端孤儿',
}

export const ORPHAN_IMPORT_PREVIEW_ACTION_LABELS: Record<OrphanImportPreviewAction, string> = {
  create: '将创建',
  skip: '跳过',
  error: '错误',
  unmatched: '未匹配规则',
}

export const ORPHAN_IMPORT_PREVIEW_ACTION_VARIANT: Record<
  OrphanImportPreviewAction,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  create: 'default',
  skip: 'outline',
  error: 'destructive',
  unmatched: 'secondary',
}

export const DEFAULT_ORPHAN_IMPORT_FIELDS = {
  opsStatus: '预留闲置中',
  lifecycleStatus: 'online',
  onboardingSubstage: '已完成',
  cooperationType: 'idle_time' as const,
  devicePurpose: '平台孤儿补录',
  inMaintenance: false,
}


export function formatOrphanImportRuleMatch(rule: {
  matchField: OrphanImportMatchField
  matchOperator: OrphanImportMatchOperator
  matchValue: string
}): string {
  const field = ORPHAN_IMPORT_MATCH_FIELD_LABELS[rule.matchField]
  const op = ORPHAN_IMPORT_MATCH_OPERATOR_LABELS[rule.matchOperator]
  return `${field} · ${op} · 「${rule.matchValue}」`
}
