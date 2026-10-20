export const TENANT_REGION_GPU_PRODUCT_LINES = [
  'elastic_deployment',
  'bare_metal',
  'spot',
] as const

export type TenantRegionGpuProductLine = (typeof TENANT_REGION_GPU_PRODUCT_LINES)[number]

export const TENANT_REGION_GPU_PRODUCT_LINE_LABELS: Record<TenantRegionGpuProductLine, string> = {
  elastic_deployment: '弹性部署',
  bare_metal: '裸金属',
  spot: 'Spot',
}

export const TENANT_REGION_GPU_SOURCE_LABELS: Record<
  'platform_sync' | 'manual_import' | 'backfill',
  string
> = {
  platform_sync: '平台同步',
  manual_import: '手工导入',
  backfill: '历史回填',
}

function normalizeProductLineKey(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase()
}

const ELASTIC_ALIASES = new Set([
  '',
  '弹性部署',
  '弹性',
  'pod',
  'deployment',
  'job',
  'development',
  'pod_deployment',
  'pod_job',
  'pod_development',
  'elastic',
  'elasticdeployment',
  '弹性部署pod',
])

const BARE_METAL_ALIASES = new Set(['裸金属', 'bare_metal', 'baremetal', 'baremetalfullrental'])

const SPOT_ALIASES = new Set(['spot'])

export function normalizeTenantRegionGpuProductLine(
  raw: string | null | undefined,
): TenantRegionGpuProductLine | { error: string } {
  if (raw == null || raw.trim() === '') {
    return 'elastic_deployment'
  }

  const key = normalizeProductLineKey(raw)
  const compact = key.replace(/_/g, '')

  if (ELASTIC_ALIASES.has(key) || ELASTIC_ALIASES.has(compact)) {
    return 'elastic_deployment'
  }
  if (BARE_METAL_ALIASES.has(key) || BARE_METAL_ALIASES.has(compact)) {
    return 'bare_metal'
  }
  if (SPOT_ALIASES.has(key)) {
    return 'spot'
  }

  return { error: `无效产品线：${raw}` }
}

export function isTenantRegionGpuProductLine(value: string): value is TenantRegionGpuProductLine {
  return (TENANT_REGION_GPU_PRODUCT_LINES as readonly string[]).includes(value)
}

export function labelTenantRegionGpuProductLine(value: string): string {
  if (isTenantRegionGpuProductLine(value)) {
    return TENANT_REGION_GPU_PRODUCT_LINE_LABELS[value]
  }
  return value
}

export function labelTenantRegionGpuSource(value: string): string {
  if (value in TENANT_REGION_GPU_SOURCE_LABELS) {
    return TENANT_REGION_GPU_SOURCE_LABELS[value as keyof typeof TENANT_REGION_GPU_SOURCE_LABELS]
  }
  return value
}
