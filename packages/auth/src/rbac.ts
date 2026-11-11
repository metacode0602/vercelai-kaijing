/**
 * 组织级业务 RBAC：权限目录、默认矩阵、并集与范围判断。
 * 与表结构无关，shop / web 共用同一套校验代码。
 */

export const PERMISSION_ACTIONS = [
  'read',
  'create',
  'update',
  'approve',
  'export',
  'configure',
] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const PERMISSION_MODULES = [
  'dashboard',
  'product',
  'purchase',
  'inventory',
  'order',
  'logistics',
  'aftersale',
  'finance',
  'report',
  'settings',
  'sync',
  'it',
] as const

export type PermissionModule = (typeof PERMISSION_MODULES)[number]

export const PERMISSION_MODULE_LABELS: Record<PermissionModule, string> = {
  dashboard: '工作台',
  product: '商品与刊登',
  purchase: '采购',
  inventory: '库存',
  order: '订单履约',
  logistics: '物流',
  aftersale: '售后',
  finance: '成本财务',
  report: '报表',
  settings: '组织设置',
  sync: '同步与集成',
  it: 'IT 特殊动作',
}

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  read: '查看',
  create: '新增',
  update: '修改',
  approve: '审核',
  export: '导出',
  configure: '配置',
}

export const SCOPE_TYPES = [
  'all',
  'platform',
  'country',
  'marketplace',
  'shop',
  'warehouse',
] as const

export type ScopeType = (typeof SCOPE_TYPES)[number]

export const SCOPE_TYPE_LABELS: Record<ScopeType, string> = {
  all: '全部',
  platform: '平台',
  country: '国家',
  marketplace: '站点',
  shop: '店铺',
  warehouse: '仓库',
}

export const IMPERSONATE_PERMISSION = 'it.impersonate'

export const SYSTEM_ROLE_CODES = [
  'biz_admin',
  'buyer',
  'operator',
  'finance',
  'viewer',
  'it_tech',
] as const

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number]

export const SYSTEM_ROLE_DEFS: Array<{
  code: SystemRoleCode
  name: string
  description: string
}> = [
  { code: 'biz_admin', name: '业务管理员', description: '除 IT 冒充外的全模块能力，默认数据范围为全部' },
  { code: 'buyer', name: '采购', description: '商品只读，采购全动作（含审核），库存查看与入库相关' },
  { code: 'operator', name: '运营', description: '商品、刊登、订单、物流与售后的查看、新增、修改' },
  { code: 'finance', name: '财务', description: '成本、费用模板、结算、利润与运费的查看、导出、审核与配置' },
  { code: 'viewer', name: '只读', description: '全业务模块仅查看，不含组织配置' },
  { code: 'it_tech', name: 'IT', description: '设置只读与同步/集成日志；不授予冒充登录' },
]

export const DEFAULT_INVITE_ROLE_CODE: SystemRoleCode = 'operator'

function permission(module: PermissionModule, action: PermissionAction): string {
  return `${module}.${action}`
}

function moduleActions(
  module: PermissionModule,
  actions: readonly PermissionAction[],
): string[] {
  return actions.map((action) => permission(module, action))
}

const ALL_ACTIONS = PERMISSION_ACTIONS
const BUSINESS_MODULES = PERMISSION_MODULES.filter((module) => module !== 'it')

export const DEFAULT_SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleCode, readonly string[]> = {
  biz_admin: BUSINESS_MODULES.flatMap((module) => moduleActions(module, ALL_ACTIONS)),
  buyer: [
    ...moduleActions('dashboard', ['read']),
    ...moduleActions('product', ['read']),
    ...moduleActions('purchase', ALL_ACTIONS),
    ...moduleActions('inventory', ['read', 'create', 'update']),
  ],
  operator: [
    ...moduleActions('dashboard', ['read']),
    ...moduleActions('product', ['read', 'create', 'update']),
    ...moduleActions('inventory', ['read']),
    ...moduleActions('order', ['read', 'create', 'update']),
    ...moduleActions('logistics', ['read', 'create', 'update']),
    ...moduleActions('aftersale', ['read', 'create', 'update']),
  ],
  finance: [
    ...moduleActions('dashboard', ['read']),
    ...moduleActions('finance', ['read', 'update', 'approve', 'export', 'configure']),
    ...moduleActions('report', ['read', 'export']),
  ],
  viewer: BUSINESS_MODULES.flatMap((module) =>
    module === 'settings' ? [] : moduleActions(module, ['read']),
  ),
  it_tech: [
    ...moduleActions('settings', ['read']),
    ...moduleActions('sync', ['read']),
  ],
}

export const DEFAULT_SYSTEM_ROLE_SCOPES: Record<
  SystemRoleCode,
  ReadonlyArray<{ scopeType: ScopeType; scopeRefId: string | null; actions: readonly PermissionAction[] }>
> = {
  biz_admin: [{ scopeType: 'all', scopeRefId: null, actions: ALL_ACTIONS }],
  buyer: [{ scopeType: 'all', scopeRefId: null, actions: ALL_ACTIONS }],
  operator: [{ scopeType: 'all', scopeRefId: null, actions: ALL_ACTIONS }],
  finance: [{ scopeType: 'all', scopeRefId: null, actions: ALL_ACTIONS }],
  viewer: [{ scopeType: 'all', scopeRefId: null, actions: ALL_ACTIONS }],
  it_tech: [{ scopeType: 'all', scopeRefId: null, actions: ALL_ACTIONS }],
}

export function isPermissionAction(value: string): value is PermissionAction {
  return (PERMISSION_ACTIONS as readonly string[]).includes(value)
}

export function isPermissionModule(value: string): value is PermissionModule {
  return (PERMISSION_MODULES as readonly string[]).includes(value)
}

export function isScopeType(value: string): value is ScopeType {
  return (SCOPE_TYPES as readonly string[]).includes(value)
}

export function isValidPermission(value: string): boolean {
  if (value === IMPERSONATE_PERMISSION) return true
  const [module, action, extra] = value.split('.')
  return Boolean(module && action && !extra && isPermissionModule(module) && isPermissionAction(action))
}

export function parsePermission(value: string): { module: string; action: string } {
  const dot = value.indexOf('.')
  if (dot <= 0 || dot === value.length - 1) {
    throw new Error(`无效的权限码：${value}`)
  }
  return { module: value.slice(0, dot), action: value.slice(dot + 1) }
}

/** 组织身份：owner（及入驻写入的 tenant_owner）隐式拥有全部权限。 */
export function isOwnerIdentity(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'tenant_owner'
}

export function unionPermissions(groups: Iterable<Iterable<string>>): string[] {
  const set = new Set<string>()
  for (const group of groups) {
    for (const item of group) set.add(item)
  }
  return [...set]
}

export function hasPermission(input: {
  organizationRole?: string | null
  permissions: Iterable<string>
  required: string
}): boolean {
  if (isOwnerIdentity(input.organizationRole)) return true
  const set = input.permissions instanceof Set ? input.permissions : new Set(input.permissions)
  return set.has(input.required)
}

export type DataScope = {
  scopeType: ScopeType | string
  scopeRefId?: string | null
  actions?: readonly string[] | null
}

export type ScopeResource = {
  shopId?: string | null
  warehouseId?: string | null
  platform?: string | null
  country?: string | null
  marketplace?: string | null
}

function scopeAppliesToAction(scope: DataScope, action?: string): boolean {
  const actions = scope.actions ?? []
  if (actions.length === 0) return true
  if (!action) return true
  return actions.includes(action)
}

export function scopeAllows(input: {
  isOwner?: boolean
  scopes: readonly DataScope[]
  resource?: ScopeResource
  action?: string
}): boolean {
  if (input.isOwner) return true
  const applicable = input.scopes.filter((scope) => scopeAppliesToAction(scope, input.action))
  if (applicable.length === 0) return true
  if (applicable.some((scope) => scope.scopeType === 'all')) return true

  const resource = input.resource ?? {}
  const hasRestrictive = applicable.some((scope) => scope.scopeType !== 'all')
  if (!hasRestrictive) return true

  if (
    resource.shopId &&
    applicable.some((scope) => scope.scopeType === 'shop' && scope.scopeRefId === resource.shopId)
  ) {
    return true
  }
  if (
    resource.warehouseId &&
    applicable.some(
      (scope) => scope.scopeType === 'warehouse' && scope.scopeRefId === resource.warehouseId,
    )
  ) {
    return true
  }
  if (
    resource.platform &&
    applicable.some(
      (scope) => scope.scopeType === 'platform' && scope.scopeRefId === resource.platform,
    )
  ) {
    return true
  }
  if (
    resource.country &&
    applicable.some((scope) => scope.scopeType === 'country' && scope.scopeRefId === resource.country)
  ) {
    return true
  }
  if (
    resource.marketplace &&
    applicable.some(
      (scope) => scope.scopeType === 'marketplace' && scope.scopeRefId === resource.marketplace,
    )
  ) {
    return true
  }

  const resourceHasId = Boolean(
    resource.shopId ||
      resource.warehouseId ||
      resource.platform ||
      resource.country ||
      resource.marketplace,
  )
  // 资源没有店铺/仓库等标识时，不因未接线的范围误杀；有标识但不命中则拒绝。
  return !resourceHasId
}

export type ScopeIdFilter = { type: 'all' } | { type: 'ids'; ids: string[] } | { type: 'none' }

export function collectScopeIds(
  scopes: readonly DataScope[],
  scopeType: 'shop' | 'warehouse',
  action?: string,
): ScopeIdFilter {
  const applicable = scopes.filter((scope) => scopeAppliesToAction(scope, action))
  if (applicable.length === 0 || applicable.some((scope) => scope.scopeType === 'all')) {
    return { type: 'all' }
  }
  const ids = [
    ...new Set(
      applicable
        .filter((scope) => scope.scopeType === scopeType && scope.scopeRefId)
        .map((scope) => scope.scopeRefId as string),
    ),
  ]
  return ids.length > 0 ? { type: 'ids', ids } : { type: 'none' }
}

export function serializeInvitationRoles(codes: readonly string[]): string {
  const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))]
  if (unique.length === 0) return DEFAULT_INVITE_ROLE_CODE
  if (unique.some((code) => isOwnerIdentity(code))) {
    throw new Error('不可通过邀请设为组织所有者')
  }
  if (unique.length === 1) return unique[0]!
  return JSON.stringify(unique)
}

export function parseInvitationRoles(role: string | null | undefined): string[] {
  const raw = (role || '').trim()
  if (!raw) return [DEFAULT_INVITE_ROLE_CODE]
  if (isOwnerIdentity(raw)) {
    throw new Error('不可通过邀请设为组织所有者')
  }
  if (raw === 'admin') return ['biz_admin']
  if (raw === 'member') return [DEFAULT_INVITE_ROLE_CODE]
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const codes = parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
        if (codes.some((code) => isOwnerIdentity(code))) {
          throw new Error('不可通过邀请设为组织所有者')
        }
        return codes.length > 0 ? [...new Set(codes)] : [DEFAULT_INVITE_ROLE_CODE]
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('组织所有者')) throw error
    }
  }
  const codes = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (codes.some((code) => isOwnerIdentity(code))) {
    throw new Error('不可通过邀请设为组织所有者')
  }
  return codes.length > 0 ? [...new Set(codes)] : [DEFAULT_INVITE_ROLE_CODE]
}

export function mapLegacyMemberRoleToBusinessCodes(memberRole: string | null | undefined): string[] {
  const role = (memberRole || '').trim()
  if (isOwnerIdentity(role)) return []
  if (role === 'admin' || role === 'biz_admin') return ['biz_admin']
  if (role === 'viewer') return ['viewer']
  if (role === 'buyer' || role === 'operator' || role === 'finance' || role === 'it_tech') {
    return [role]
  }
  return [DEFAULT_INVITE_ROLE_CODE]
}

export function forbiddenPermissionMessage(permission: string): string {
  return `当前角色无权执行该操作（需要 ${permission}）`
}

export function permissionsSubset(owned: Iterable<string>, granted: Iterable<string>): string[] {
  const set = owned instanceof Set ? owned : new Set(owned)
  return [...granted].filter((item) => !set.has(item))
}

export const OWNER_ANNOTATION = '组织所有者（全部权限）'
