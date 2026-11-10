/**
 * 组织级业务 RBAC：系统角色种子、权限矩阵、数据范围与成员绑定。
 */
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  commerceWarehouses,
  member,
  memberRoles,
  rolePermissions,
  roleScopes,
  roles,
  shops,
  user,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  DEFAULT_SYSTEM_ROLE_PERMISSIONS,
  DEFAULT_SYSTEM_ROLE_SCOPES,
  OWNER_ANNOTATION,
  PERMISSION_ACTIONS,
  SYSTEM_ROLE_DEFS,
  collectScopeIds,
  forbiddenPermissionMessage,
  hasPermission,
  isOwnerIdentity,
  isScopeType,
  isValidPermission,
  mapLegacyMemberRoleToBusinessCodes,
  permissionsSubset,
  type DataScope,
  type PermissionAction,
  type ScopeType,
} from '@workspace/auth'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import { formatStamp } from '@/lib/server/mappers/ops-master'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type AccessSnapshot = {
  userId: string | null
  organizationId: string
  organizationRole: string | null
  isOwner: boolean
  permissions: string[]
  permissionSet: Set<string>
  scopes: DataScope[]
  roleCodes: string[]
}

export type RoleListItem = {
  id: string
  code: string
  name: string
  description: string
  isSystem: boolean
  status: 'enabled' | 'disabled'
  memberCount: number
  updatedAt: string
  createdAt: string
}

export type BoundMemberDto = {
  userId: string
  memberId: string
  name: string
  email: string
  phone: string
  isOwner: boolean
  annotation?: string
}

export type RoleDetailDto = {
  id: string
  code: string
  name: string
  description: string
  isSystem: boolean
  status: 'enabled' | 'disabled'
  permissions: string[]
  scopes: Array<{
    id: string
    scopeType: string
    scopeRefId: string | null
    actions: string[]
  }>
  members: BoundMemberDto[]
  updatedAt: string
}

function asStatus(value: string | null | undefined): 'enabled' | 'disabled' {
  return value === 'disabled' ? 'disabled' : 'enabled'
}

export function ownerAccess(organizationId: string, userId: string | null = null): AccessSnapshot {
  return {
    userId,
    organizationId,
    organizationRole: 'owner',
    isOwner: true,
    permissions: [],
    permissionSet: new Set(),
    scopes: [{ scopeType: 'all', scopeRefId: null, actions: [...PERMISSION_ACTIONS] }],
    roleCodes: [],
  }
}

export async function ensureOrgRbac(db: DbLike, organizationId: string): Promise<void> {
  const existing = await db
    .select({
      id: roles.id,
      code: roles.code,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .where(eq(roles.organizationId, organizationId))

  const byCode = new Map(existing.map((row) => [row.code, row]))

  for (const def of SYSTEM_ROLE_DEFS) {
    let roleId = byCode.get(def.code)?.id
    if (!roleId) {
      roleId = createId()
      await db.insert(roles).values({
        id: roleId,
        organizationId,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
        status: 'enabled',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      byCode.set(def.code, { id: roleId, code: def.code, isSystem: true })
    }

    const [permCount] = await db
      .select({ value: count() })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
    if (Number(permCount?.value ?? 0) === 0) {
      const permissions = DEFAULT_SYSTEM_ROLE_PERMISSIONS[def.code]
      if (permissions.length > 0) {
        await db.insert(rolePermissions).values(
          permissions.map((permission) => ({
            id: createId(),
            roleId,
            permission,
          })),
        )
      }
    }

    const [scopeCount] = await db
      .select({ value: count() })
      .from(roleScopes)
      .where(eq(roleScopes.roleId, roleId))
    if (Number(scopeCount?.value ?? 0) === 0) {
      await db.insert(roleScopes).values(
        DEFAULT_SYSTEM_ROLE_SCOPES[def.code].map((scope) => ({
          id: createId(),
          organizationId,
          roleId,
          scopeType: scope.scopeType,
          scopeRefId: scope.scopeRefId,
          actions: [...scope.actions],
          createdAt: new Date(),
        })),
      )
    }
  }

  const members = await db
    .select({
      userId: member.userId,
      role: member.role,
    })
    .from(member)
    .where(eq(member.organizationId, organizationId))

  for (const row of members) {
    if (isOwnerIdentity(row.role)) continue
    const [bound] = await db
      .select({ value: count() })
      .from(memberRoles)
      .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.userId, row.userId)))
    if (Number(bound?.value ?? 0) === 0) {
      const codes = mapLegacyMemberRoleToBusinessCodes(row.role)
      await bindMemberRoleCodes(db, organizationId, row.userId, codes)
    }
    if (row.role !== 'member') {
      await db
        .update(member)
        .set({ role: 'member' })
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, row.userId)))
    }
  }
}

export async function bindMemberRoleCodes(
  db: DbLike,
  organizationId: string,
  userId: string,
  codes: readonly string[],
): Promise<void> {
  const uniqueCodes = [...new Set(codes.filter(Boolean))]
  if (uniqueCodes.length === 0) return
  const rows = await db
    .select({ id: roles.id, code: roles.code, status: roles.status })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), inArray(roles.code, uniqueCodes)))
  const found = new Map(rows.map((row) => [row.code, row]))
  for (const code of uniqueCodes) {
    const role = found.get(code)
    if (!role) throw new Error(`角色不存在：${code}`)
    if (role.status === 'disabled') throw new Error(`角色「${code}」已停用，不可再分配`)
    const [existing] = await db
      .select({ id: memberRoles.id })
      .from(memberRoles)
      .where(
        and(
          eq(memberRoles.organizationId, organizationId),
          eq(memberRoles.userId, userId),
          eq(memberRoles.roleId, role.id),
        ),
      )
      .limit(1)
    if (existing) continue
    await db.insert(memberRoles).values({
      id: createId(),
      organizationId,
      userId,
      roleId: role.id,
      createdAt: new Date(),
    })
  }
}

export async function loadAccessSnapshot(
  db: DbLike,
  organizationId: string,
  input: { userId?: string | null; organizationRole?: string | null },
): Promise<AccessSnapshot> {
  await ensureOrgRbac(db, organizationId)
  if (isOwnerIdentity(input.organizationRole)) {
    return ownerAccess(organizationId, input.userId ?? null)
  }
  if (!input.userId) {
    return {
      userId: null,
      organizationId,
      organizationRole: input.organizationRole ?? null,
      isOwner: false,
      permissions: [],
      permissionSet: new Set(),
      scopes: [],
      roleCodes: [],
    }
  }

  const rows = await db
    .select({
      roleCode: roles.code,
      roleStatus: roles.status,
      permission: rolePermissions.permission,
    })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.userId, input.userId)))

  const roleCodes = [...new Set(rows.filter((row) => row.roleStatus === 'enabled').map((row) => row.roleCode))]
  const permissions = [
    ...new Set(
      rows
        .filter((row) => row.roleStatus === 'enabled' && row.permission)
        .map((row) => row.permission as string),
    ),
  ]

  const enabledRoleIds = [
    ...new Set(
      (
        await db
          .select({ roleId: memberRoles.roleId, status: roles.status })
          .from(memberRoles)
          .innerJoin(roles, eq(memberRoles.roleId, roles.id))
          .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.userId, input.userId)))
      )
        .filter((row) => row.status === 'enabled')
        .map((row) => row.roleId),
    ),
  ]

  let scopes: DataScope[] = []
  if (enabledRoleIds.length > 0) {
    const scopeRows = await db
      .select()
      .from(roleScopes)
      .where(and(eq(roleScopes.organizationId, organizationId), inArray(roleScopes.roleId, enabledRoleIds)))
    scopes = scopeRows.map((row) => ({
      scopeType: row.scopeType,
      scopeRefId: row.scopeRefId,
      actions: Array.isArray(row.actions) ? row.actions : [],
    }))
  }

  return {
    userId: input.userId,
    organizationId,
    organizationRole: input.organizationRole ?? null,
    isOwner: false,
    permissions,
    permissionSet: new Set(permissions),
    scopes,
    roleCodes,
  }
}

export function assertPermission(access: AccessSnapshot, permission: string): void {
  if (
    hasPermission({
      organizationRole: access.isOwner ? 'owner' : access.organizationRole,
      permissions: access.permissionSet,
      required: permission,
    })
  ) {
    return
  }
  throw new Error(forbiddenPermissionMessage(permission))
}

export async function listUsersWithConfigure(
  db: DbLike,
  organizationId: string,
): Promise<Set<string>> {
  const holders = new Set<string>()
  const members = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, organizationId))
  for (const row of members) {
    if (isOwnerIdentity(row.role)) holders.add(row.userId)
  }

  const granted = await db
    .select({ userId: memberRoles.userId })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(
      and(
        eq(memberRoles.organizationId, organizationId),
        eq(roles.status, 'enabled'),
        eq(rolePermissions.permission, 'settings.configure'),
      ),
    )
  for (const row of granted) holders.add(row.userId)
  return holders
}

async function assertConfigurePathRemains(
  db: DbLike,
  organizationId: string,
  actorUserId: string | null,
): Promise<void> {
  const holders = await listUsersWithConfigure(db, organizationId)
  if (holders.size === 0) {
    throw new Error('不能停用或收回导致无人可配置组织设置的最后一条路径')
  }
  if (actorUserId && !holders.has(actorUserId)) {
    throw new Error('不能移除自己唯一的组织配置权限')
  }
}

function assertCanGrant(access: AccessSnapshot, permissions: readonly string[]): void {
  if (access.isOwner) return
  const missing = permissionsSubset(access.permissionSet, permissions)
  if (missing.length > 0) {
    throw new Error(`不能授予自己没有的权限：${missing.join('、')}`)
  }
}

async function loadRoleRow(db: DbLike, organizationId: string, roleId: string) {
  const [row] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.id, roleId)))
    .limit(1)
  if (!row) throw new Error('角色不存在')
  return row
}

async function listPermissionsForRole(db: DbLike, roleId: string): Promise<string[]> {
  const rows = await db
    .select({ permission: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId))
  return rows.map((row) => row.permission)
}

export async function listRoles(db: AppDatabase, organizationId: string): Promise<RoleListItem[]> {
  await ensureOrgRbac(db, organizationId)
  const rows = await db
    .select()
    .from(roles)
    .where(eq(roles.organizationId, organizationId))
    .orderBy(desc(roles.isSystem), roles.createdAt)

  const counts = await db
    .select({ roleId: memberRoles.roleId, value: count() })
    .from(memberRoles)
    .where(eq(memberRoles.organizationId, organizationId))
    .groupBy(memberRoles.roleId)
  const countMap = new Map(counts.map((row) => [row.roleId, Number(row.value)]))

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    isSystem: Boolean(row.isSystem),
    status: asStatus(row.status),
    memberCount: countMap.get(row.id) ?? 0,
    updatedAt: formatStamp(row.updatedAt),
    createdAt: formatStamp(row.createdAt),
  }))
}

export async function getRole(db: AppDatabase, organizationId: string, roleId: string): Promise<RoleDetailDto> {
  await ensureOrgRbac(db, organizationId)
  const row = await loadRoleRow(db, organizationId, roleId)
  const permissions = await listPermissionsForRole(db, roleId)
  const scopeRows = await db.select().from(roleScopes).where(eq(roleScopes.roleId, roleId))
  const bound = await db
    .select({
      userId: memberRoles.userId,
      memberId: member.id,
      name: user.name,
      email: user.email,
      phone: user.phoneNumber,
      identityRole: member.role,
    })
    .from(memberRoles)
    .innerJoin(user, eq(memberRoles.userId, user.id))
    .leftJoin(
      member,
      and(eq(member.userId, memberRoles.userId), eq(member.organizationId, organizationId)),
    )
    .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.roleId, roleId)))

  const owners = await db
    .select({
      userId: member.userId,
      memberId: member.id,
      name: user.name,
      email: user.email,
      phone: user.phoneNumber,
      identityRole: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))

  const members: BoundMemberDto[] = bound.map((item) => ({
    userId: item.userId,
    memberId: item.memberId || item.userId,
    name: item.name || item.email || item.phone || item.userId,
    email: item.email || '',
    phone: item.phone || '',
    isOwner: isOwnerIdentity(item.identityRole),
  }))

  for (const owner of owners.filter((item) => isOwnerIdentity(item.identityRole))) {
    if (members.some((item) => item.userId === owner.userId)) continue
    members.unshift({
      userId: owner.userId,
      memberId: owner.memberId,
      name: owner.name || owner.email || owner.phone || owner.userId,
      email: owner.email || '',
      phone: owner.phone || '',
      isOwner: true,
      annotation: OWNER_ANNOTATION,
    })
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    isSystem: Boolean(row.isSystem),
    status: asStatus(row.status),
    permissions,
    scopes: scopeRows.map((scope) => ({
      id: scope.id,
      scopeType: scope.scopeType,
      scopeRefId: scope.scopeRefId,
      actions: Array.isArray(scope.actions) ? scope.actions : [],
    })),
    members,
    updatedAt: formatStamp(row.updatedAt),
  }
}

function normalizeCode(input: string): string {
  const code = input.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(code)) {
    throw new Error('角色编码须以字母开头，仅含小写字母、数字或下划线，长度 2–31')
  }
  return code
}

async function assertCodeAvailable(db: DbLike, organizationId: string, code: string, exceptId?: string) {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.code, code)))
    .limit(1)
  if (existing && existing.id !== exceptId) throw new Error(`角色编码已存在：${code}`)
}

async function writeRoleAudit(
  db: DbLike,
  organizationId: string,
  actor: { userId?: string | null; label?: string | null },
  action: string,
  entityId: string,
  detail: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) {
  await appendAuditEvent(db, organizationId, {
    actorUserId: actor.userId ?? undefined,
    actorLabel: actor.label ?? undefined,
    action,
    entityType: 'role',
    entityId,
    result: 'ok',
    detail,
    before,
    after,
  })
}

export async function createRole(
  db: AppDatabase,
  organizationId: string,
  access: AccessSnapshot,
  input: { name: string; code?: string; description?: string; permissions?: string[] },
  actor: { userId?: string | null; label?: string | null },
) {
  await ensureOrgRbac(db, organizationId)
  const name = input.name.trim()
  if (!name) throw new Error('请填写角色名称')
  const rawCode = (input.code || '').trim()
  const fallback = `custom_${createId().slice(0, 10)}`
  const code = normalizeCode(rawCode || fallback)
  await assertCodeAvailable(db, organizationId, code)
  const permissions = [...new Set((input.permissions ?? []).filter(isValidPermission))]
  assertCanGrant(access, permissions)
  const id = createId()
  await db.insert(roles).values({
    id,
    organizationId,
    code,
    name,
    description: input.description?.trim() || null,
    isSystem: false,
    status: 'enabled',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  if (permissions.length > 0) {
    await db.insert(rolePermissions).values(
      permissions.map((permission) => ({
        id: createId(),
        roleId: id,
        permission,
      })),
    )
  }
  await db.insert(roleScopes).values({
    id: createId(),
    organizationId,
    roleId: id,
    scopeType: 'all',
    scopeRefId: null,
    actions: [...PERMISSION_ACTIONS],
    createdAt: new Date(),
  })
  await writeRoleAudit(db, organizationId, actor, 'role.create', id, `创建角色 ${name}（${code}）`, undefined, {
    code,
    name,
    permissions,
  })
  return getRole(db, organizationId, id)
}

export async function updateRoleInfo(
  db: AppDatabase,
  organizationId: string,
  _access: AccessSnapshot,
  input: { id: string; name?: string; code?: string; description?: string },
  actor: { userId?: string | null; label?: string | null },
) {
  const row = await loadRoleRow(db, organizationId, input.id)
  const nextName = input.name?.trim() || row.name
  if (!nextName) throw new Error('请填写角色名称')
  let nextCode = row.code
  if (input.code && input.code.trim() !== row.code) {
    if (row.isSystem) throw new Error('系统角色编码不可修改')
    nextCode = normalizeCode(input.code)
    await assertCodeAvailable(db, organizationId, nextCode, row.id)
  }
  const nextDescription = input.description !== undefined ? input.description.trim() || null : row.description
  await db
    .update(roles)
    .set({
      name: nextName,
      code: nextCode,
      description: nextDescription,
      updatedAt: new Date(),
    })
    .where(eq(roles.id, row.id))
  await writeRoleAudit(
    db,
    organizationId,
    actor,
    'role.update',
    row.id,
    `更新角色 ${nextName}`,
    { name: row.name, code: row.code, description: row.description },
    { name: nextName, code: nextCode, description: nextDescription },
  )
  return getRole(db, organizationId, row.id)
}

export async function copyRole(
  db: AppDatabase,
  organizationId: string,
  access: AccessSnapshot,
  input: { id: string; name?: string; code?: string },
  actor: { userId?: string | null; label?: string | null },
) {
  const source = await getRole(db, organizationId, input.id)
  assertCanGrant(access, source.permissions)
  const name = (input.name || `${source.name}（副本）`).trim()
  let code = input.code?.trim()
  if (code) code = normalizeCode(code)
  else {
    const base = `${source.code}_copy`.slice(0, 28)
    code = base
    let suffix = 2
    while (true) {
      try {
        await assertCodeAvailable(db, organizationId, code)
        break
      } catch {
        code = `${base}${suffix}`.slice(0, 31)
        suffix += 1
      }
    }
  }
  const created = await createRole(
    db,
    organizationId,
    access,
    { name, code, description: source.description, permissions: source.permissions },
    actor,
  )
  await db.delete(roleScopes).where(eq(roleScopes.roleId, created.id))
  if (source.scopes.length > 0) {
    await db.insert(roleScopes).values(
      source.scopes.map((scope) => ({
        id: createId(),
        organizationId,
        roleId: created.id,
        scopeType: scope.scopeType,
        scopeRefId: scope.scopeRefId,
        actions: scope.actions,
        createdAt: new Date(),
      })),
    )
  }
  await writeRoleAudit(db, organizationId, actor, 'role.copy', created.id, `从 ${source.name} 复制角色`, {
    sourceId: source.id,
  })
  return getRole(db, organizationId, created.id)
}

export async function setRoleStatus(
  db: AppDatabase,
  organizationId: string,
  access: AccessSnapshot,
  input: { id: string; status: 'enabled' | 'disabled' },
  actor: { userId?: string | null; label?: string | null },
) {
  const row = await loadRoleRow(db, organizationId, input.id)
  if (row.status === input.status) return getRole(db, organizationId, row.id)
  await db
    .update(roles)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(roles.id, row.id))
  try {
    await assertConfigurePathRemains(db, organizationId, access.userId)
  } catch (error) {
    await db.update(roles).set({ status: row.status, updatedAt: new Date() }).where(eq(roles.id, row.id))
    throw error
  }
  await writeRoleAudit(
    db,
    organizationId,
    actor,
    'role.status',
    row.id,
    input.status === 'disabled' ? `停用角色 ${row.name}` : `启用角色 ${row.name}`,
    { status: row.status },
    { status: input.status },
  )
  return getRole(db, organizationId, row.id)
}

export async function saveRolePermissions(
  db: AppDatabase,
  organizationId: string,
  access: AccessSnapshot,
  input: { id: string; permissions: string[] },
  actor: { userId?: string | null; label?: string | null },
) {
  const row = await loadRoleRow(db, organizationId, input.id)
  const permissions = [...new Set(input.permissions.filter(isValidPermission))]
  if (permissions.includes('it.impersonate') && !access.isOwner) {
    throw new Error('不能授予冒充登录权限')
  }
  assertCanGrant(access, permissions)
  const previous = await listPermissionsForRole(db, row.id)
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, row.id))
  if (permissions.length > 0) {
    await db.insert(rolePermissions).values(
      permissions.map((permission) => ({
        id: createId(),
        roleId: row.id,
        permission,
      })),
    )
  }
  await db.update(roles).set({ updatedAt: new Date() }).where(eq(roles.id, row.id))
  try {
    await assertConfigurePathRemains(db, organizationId, access.userId)
  } catch (error) {
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, row.id))
    if (previous.length > 0) {
      await db.insert(rolePermissions).values(
        previous.map((permission) => ({
          id: createId(),
          roleId: row.id,
          permission,
        })),
      )
    }
    throw error
  }
  await writeRoleAudit(
    db,
    organizationId,
    actor,
    'role.permissions',
    row.id,
    `更新角色 ${row.name} 权限矩阵`,
    { permissions: previous },
    { permissions },
  )
  return getRole(db, organizationId, row.id)
}

export async function addRoleScope(
  db: AppDatabase,
  organizationId: string,
  input: { roleId: string; scopeType: string; scopeRefId?: string | null; actions?: string[] },
  actor: { userId?: string | null; label?: string | null },
) {
  const row = await loadRoleRow(db, organizationId, input.roleId)
  if (!isScopeType(input.scopeType)) throw new Error('不支持的数据范围类型')
  if (input.scopeType !== 'all' && !input.scopeRefId?.trim()) {
    throw new Error('请选择具体的范围对象')
  }
  const actions = (input.actions ?? [...PERMISSION_ACTIONS]).filter((item): item is PermissionAction =>
    (PERMISSION_ACTIONS as readonly string[]).includes(item),
  )
  const id = createId()
  await db.insert(roleScopes).values({
    id,
    organizationId,
    roleId: row.id,
    scopeType: input.scopeType as ScopeType,
    scopeRefId: input.scopeType === 'all' ? null : input.scopeRefId?.trim() || null,
    actions,
    createdAt: new Date(),
  })
  await db.update(roles).set({ updatedAt: new Date() }).where(eq(roles.id, row.id))
  await writeRoleAudit(db, organizationId, actor, 'role.scope.add', row.id, `为角色 ${row.name} 添加数据范围`, undefined, {
    scopeType: input.scopeType,
    scopeRefId: input.scopeRefId,
    actions,
  })
  return getRole(db, organizationId, row.id)
}

export async function removeRoleScope(
  db: AppDatabase,
  organizationId: string,
  input: { id: string },
  actor: { userId?: string | null; label?: string | null },
) {
  const [scope] = await db
    .select()
    .from(roleScopes)
    .where(and(eq(roleScopes.organizationId, organizationId), eq(roleScopes.id, input.id)))
    .limit(1)
  if (!scope) throw new Error('数据范围不存在')
  await db.delete(roleScopes).where(eq(roleScopes.id, scope.id))
  await db.update(roles).set({ updatedAt: new Date() }).where(eq(roles.id, scope.roleId))
  await writeRoleAudit(
    db,
    organizationId,
    actor,
    'role.scope.remove',
    scope.roleId,
    '移除数据范围',
    { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId },
  )
  return getRole(db, organizationId, scope.roleId)
}

export async function bindMembersToRole(
  db: AppDatabase,
  organizationId: string,
  access: AccessSnapshot,
  input: { roleId: string; userIds: string[] },
  actor: { userId?: string | null; label?: string | null },
) {
  const row = await loadRoleRow(db, organizationId, input.roleId)
  if (row.status === 'disabled') throw new Error('已停用的角色不可再分配')
  const permissions = await listPermissionsForRole(db, row.id)
  assertCanGrant(access, permissions)
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  if (userIds.length === 0) throw new Error('请选择要绑定的成员')

  const members = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), inArray(member.userId, userIds)))
  if (members.length !== userIds.length) throw new Error('只能绑定本组织成员')
  if (members.some((item) => isOwnerIdentity(item.role))) {
    throw new Error('组织所有者已拥有全部权限，无需绑定业务角色')
  }

  for (const item of members) {
    const [existing] = await db
      .select({ id: memberRoles.id })
      .from(memberRoles)
      .where(
        and(
          eq(memberRoles.organizationId, organizationId),
          eq(memberRoles.userId, item.userId),
          eq(memberRoles.roleId, row.id),
        ),
      )
      .limit(1)
    if (existing) continue
    await db.insert(memberRoles).values({
      id: createId(),
      organizationId,
      userId: item.userId,
      roleId: row.id,
      createdAt: new Date(),
    })
  }
  await writeRoleAudit(db, organizationId, actor, 'role.bind', row.id, `绑定成员到角色 ${row.name}`, undefined, {
    userIds,
  })
  return getRole(db, organizationId, row.id)
}

export async function unbindMembersFromRole(
  db: AppDatabase,
  organizationId: string,
  access: AccessSnapshot,
  input: { roleId: string; userIds: string[] },
  actor: { userId?: string | null; label?: string | null },
) {
  const row = await loadRoleRow(db, organizationId, input.roleId)
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  if (userIds.length === 0) throw new Error('请选择要解除绑定的成员')
  await db
    .delete(memberRoles)
    .where(
      and(
        eq(memberRoles.organizationId, organizationId),
        eq(memberRoles.roleId, row.id),
        inArray(memberRoles.userId, userIds),
      ),
    )
  try {
    await assertConfigurePathRemains(db, organizationId, access.userId)
  } catch (error) {
    for (const userId of userIds) {
      await db.insert(memberRoles).values({
        id: createId(),
        organizationId,
        userId,
        roleId: row.id,
        createdAt: new Date(),
      })
    }
    throw error
  }
  await writeRoleAudit(db, organizationId, actor, 'role.unbind', row.id, `从角色 ${row.name} 解除成员绑定`, {
    userIds,
  })
  return getRole(db, organizationId, row.id)
}

export async function replaceMemberBusinessRoles(
  db: DbLike,
  organizationId: string,
  access: AccessSnapshot,
  input: { userId: string; roleCodes: string[] },
  actor: { userId?: string | null; label?: string | null },
) {
  await ensureOrgRbac(db, organizationId)
  const [target] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, input.userId)))
    .limit(1)
  if (!target) throw new Error('成员不存在')
  if (isOwnerIdentity(target.role)) throw new Error('所有者角色不可修改')

  const uniqueCodes = [...new Set(input.roleCodes.filter(Boolean))]
  const roleRows =
    uniqueCodes.length === 0
      ? []
      : await db
          .select()
          .from(roles)
          .where(and(eq(roles.organizationId, organizationId), inArray(roles.code, uniqueCodes)))
  if (roleRows.length !== uniqueCodes.length) throw new Error('存在无效的业务角色')
  if (roleRows.some((row) => row.status === 'disabled')) throw new Error('已停用的角色不可再分配')
  for (const row of roleRows) {
    const permissions = await listPermissionsForRole(db, row.id)
    assertCanGrant(access, permissions)
  }

  const previous = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.userId, input.userId)))

  await db
    .delete(memberRoles)
    .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.userId, input.userId)))
  if (roleRows.length > 0) {
    await db.insert(memberRoles).values(
      roleRows.map((row) => ({
        id: createId(),
        organizationId,
        userId: input.userId,
        roleId: row.id,
        createdAt: new Date(),
      })),
    )
  }
  try {
    await assertConfigurePathRemains(db, organizationId, access.userId)
  } catch (error) {
    await db
      .delete(memberRoles)
      .where(and(eq(memberRoles.organizationId, organizationId), eq(memberRoles.userId, input.userId)))
    if (previous.length > 0) {
      await db.insert(memberRoles).values(
        previous.map((row) => ({
          id: createId(),
          organizationId,
          userId: input.userId,
          roleId: row.roleId,
          createdAt: new Date(),
        })),
      )
    }
    throw error
  }
  await writeRoleAudit(
    db as AppDatabase,
    organizationId,
    actor,
    'role.bind',
    input.userId,
    '更新成员业务角色',
    { roleIds: previous.map((row) => row.roleId) },
    { roleCodes: uniqueCodes },
  )
}

export async function listAssignableMembers(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({
      userId: member.userId,
      memberId: member.id,
      name: user.name,
      email: user.email,
      phone: user.phoneNumber,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
  return rows.map((row) => ({
    userId: row.userId,
    memberId: row.memberId,
    name: row.name || row.email || row.phone || row.userId,
    email: row.email || '',
    phone: row.phone || '',
    isOwner: isOwnerIdentity(row.role),
    annotation: isOwnerIdentity(row.role) ? OWNER_ANNOTATION : undefined,
  }))
}

export async function listScopeTargets(db: AppDatabase, organizationId: string) {
  const shopRows = await db
    .select({
      id: shops.id,
      name: shops.name,
      platform: shops.platform,
    })
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .orderBy(shops.name)
  const warehouseRows = await db
    .select({
      id: commerceWarehouses.id,
      name: commerceWarehouses.name,
      code: commerceWarehouses.code,
    })
    .from(commerceWarehouses)
    .where(eq(commerceWarehouses.organizationId, organizationId))
    .orderBy(commerceWarehouses.name)
  return {
    shops: shopRows.map((row) => ({
      id: row.id,
      name: row.name,
      label: row.platform ? `${row.name}（${row.platform}）` : row.name,
    })),
    warehouses: warehouseRows.map((row) => ({
      id: row.id,
      name: row.name,
      label: row.code ? `${row.name}（${row.code}）` : row.name,
    })),
  }
}

export function shopIdFilter(access: AccessSnapshot, action = 'read') {
  return collectScopeIds(access.scopes, 'shop', action)
}

export function warehouseIdFilter(access: AccessSnapshot, action = 'read') {
  return collectScopeIds(access.scopes, 'warehouse', action)
}

export async function listMemberBusinessRoles(
  db: DbLike,
  organizationId: string,
  userIds: string[],
): Promise<Map<string, Array<{ id: string; code: string; name: string }>>> {
  const result = new Map<string, Array<{ id: string; code: string; name: string }>>()
  if (userIds.length === 0) return result
  const rows = await db
    .select({
      userId: memberRoles.userId,
      id: roles.id,
      code: roles.code,
      name: roles.name,
    })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .where(and(eq(memberRoles.organizationId, organizationId), inArray(memberRoles.userId, userIds)))
  for (const row of rows) {
    const list = result.get(row.userId) ?? []
    list.push({ id: row.id, code: row.code, name: row.name })
    result.set(row.userId, list)
  }
  return result
}
