import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/organization/access'

// ---------------------------------------------------------------------------
// 资源权限声明（statements）
// ---------------------------------------------------------------------------
// defaultStatements 提供: organization, member, invitation
// 我们扩展 project, task, device, billing, scheduling 资源

const statement = {
  ...defaultStatements,
  organization: ['update', 'delete', 'read'] as const,
  member: ['create', 'update', 'delete', 'read'] as const,
  invitation: ['create', 'cancel', 'read'] as const,
  project: ['create', 'share', 'update', 'delete', 'read'] as const,
  task: ['create', 'read', 'update', 'delete', 'cancel'] as const,
  device: ['create', 'read', 'update', 'delete', 'maintain'] as const,
  billing: ['read', 'manage'] as const,
  scheduling: ['manage'] as const,
} as const

const ac = createAccessControl(statement)

// ===========================================================================
// 平台组织角色 (orgType = 'platform')
// ===========================================================================

/** 平台超级管理员 — 全权管理调度引擎、供应商审核、经销商管理 */
const platform_admin = ac.newRole({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete', 'cancel'],
  device: ['create', 'read', 'update', 'delete', 'maintain'],
  billing: ['read', 'manage'],
  scheduling: ['manage'],
})

/** 平台调度运营 — 管理任务队列、设备调度策略 */
const platform_operator = ac.newRole({
  member: ['create', 'update'],
  invitation: ['create'],
  project: ['create', 'update'],
  task: ['create', 'read', 'update', 'cancel'],
  device: ['read', 'maintain'],
  billing: ['read'],
  scheduling: ['manage'],
})

/** 平台财务 — 管理结算、账单、对账 */
const platform_finance = ac.newRole({
  member: ['read'],
  project: ['read'],
  task: ['read'],
  device: ['read'],
  billing: ['read', 'manage'],
})

// ===========================================================================
// 租户组织角色 (orgType = 'tenant')
// ===========================================================================

/** 租户所有者 — 完全控制任务与账单 */
const tenant_owner = ac.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete', 'cancel'],
  billing: ['read', 'manage'],
})

/** 租户工程师 — 提交和管理计算任务（不可管理成员） */
const tenant_engineer = ac.newRole({
  project: ['create', 'update'],
  task: ['create', 'read', 'update', 'cancel'],
  billing: ['read'],
})

/** 租户查看者 — 只读任务与用量数据 */
const tenant_viewer = ac.newRole({
  project: ['read'],
  task: ['read'],
  billing: ['read'],
})

/** 站点运营 — 限定单项目操作（由经销商代运营或内部运维） */
const site_operator = ac.newRole({
  project: ['read', 'update'],
  task: ['read', 'update'],
})

// ===========================================================================
// 经销商组织角色 (orgType = 'merchant')
// ===========================================================================

/** 经销商所有者 — 管理服务包、发展租户、查看分成 */
const merchant_owner = ac.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete', 'cancel'],
  billing: ['read', 'manage'],
})

/** 经销商销售 — 可发展租户（不可改成员/分成） */
const merchant_sales = ac.newRole({
  invitation: ['create'],
  project: ['create'],
  task: ['read'],
  billing: ['read'],
})

/** 经销商运营 — 可代运营下属租户的任务 */
const merchant_operator = ac.newRole({
  project: ['create', 'update'],
  task: ['create', 'read', 'update', 'cancel'],
  billing: ['read'],
})

/** 经销商财务 — 只读财务与分成数据 */
const merchant_finance = ac.newRole({
  task: ['read'],
  billing: ['read', 'manage'],
})

// ===========================================================================
// 供应商组织角色 (orgType = 'supplier')
// ===========================================================================

/** 供应商所有者 — 管理设备、查看收益 */
const supplier_owner = ac.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  device: ['create', 'read', 'update', 'delete', 'maintain'],
  billing: ['read', 'manage'],
})

/** 供应商技术人员 — 管理设备注册、维护、监控 */
const supplier_technician = ac.newRole({
  device: ['create', 'read', 'update', 'maintain'],
  billing: ['read'],
})

/** 供应商查看者 — 只读设备与收益数据 */
const supplier_viewer = ac.newRole({
  device: ['read'],
  billing: ['read'],
})

// ===========================================================================
// 向后兼容导出（保留原有角色名）
// ===========================================================================

const owner = platform_admin
const admin = platform_operator
const member = ac.newRole({
  project: ['create'],
})

// ===========================================================================
// 辅助工具
// ===========================================================================

/** 所有合法的组织角色名（按组织类型分组） */
export const ORG_ROLES = {
  platform: ['platform_admin', 'platform_operator', 'platform_finance'] as const,
  tenant: ['tenant_owner', 'tenant_engineer', 'tenant_viewer', 'site_operator'] as const,
  merchant: ['merchant_owner', 'merchant_sales', 'merchant_operator', 'merchant_finance'] as const,
  supplier: ['supplier_owner', 'supplier_technician', 'supplier_viewer'] as const,
} as const

export type PlatformRole = (typeof ORG_ROLES.platform)[number]
export type TenantRole = (typeof ORG_ROLES.tenant)[number]
export type MerchantRole = (typeof ORG_ROLES.merchant)[number]
export type SupplierRole = (typeof ORG_ROLES.supplier)[number]
export type OrgRole = PlatformRole | TenantRole | MerchantRole | SupplierRole

/** 判断某个角色是否属于指定组织类型 */
export function isValidRoleForOrgType(
  orgType: 'platform' | 'supplier' | 'merchant' | 'tenant',
  role: string,
): boolean {
  return (ORG_ROLES[orgType] as readonly string[]).includes(role)
}

/** 获取组织类型下所有角色 */
export function getRolesForOrgType(
  orgType: 'platform' | 'supplier' | 'merchant' | 'tenant',
): readonly string[] {
  return ORG_ROLES[orgType]
}

export {
  ac,
  // 平台角色
  platform_admin,
  platform_operator,
  platform_finance,
  // 租户角色
  tenant_owner,
  tenant_engineer,
  tenant_viewer,
  site_operator,
  // 经销商角色
  merchant_owner,
  merchant_sales,
  merchant_operator,
  merchant_finance,
  // 供应商角色
  supplier_owner,
  supplier_technician,
  supplier_viewer,
  // 向后兼容
  owner,
  admin,
  member,
  statement,
}
