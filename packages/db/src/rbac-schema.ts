import { pgTable } from "drizzle-orm/pg-core"
import { organization, user } from "./auth-schema"
import {
  memberRolesColumns,
  memberRolesConstraints,
  rolePermissionsColumns,
  rolePermissionsConstraints,
  roleScopesColumns,
  roleScopesConstraints,
  rolesColumns,
  rolesConstraints,
} from "./rbac-columns"

/**
 * 租户侧业务 RBAC（public schema）。
 * 列定义见 rbac-columns.ts；平台侧同形表见 web-auth-schema.ts。
 */
export const roles = pgTable("roles", rolesColumns(organization), (table) =>
  rolesConstraints(table),
)

export const rolePermissions = pgTable(
  "role_permissions",
  rolePermissionsColumns(roles),
  (table) => rolePermissionsConstraints(table),
)

export const memberRoles = pgTable(
  "member_roles",
  memberRolesColumns(organization, user, roles),
  (table) => memberRolesConstraints(table),
)

export const roleScopes = pgTable(
  "role_scopes",
  roleScopesColumns(organization, roles),
  (table) => roleScopesConstraints(table),
)

export type RbacRole = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
export type RolePermission = typeof rolePermissions.$inferSelect
export type MemberRole = typeof memberRoles.$inferSelect
export type RoleScope = typeof roleScopes.$inferSelect
