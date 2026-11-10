import {
  boolean,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

/**
 * 组织级业务 RBAC 列工厂（单一事实来源）。
 *
 * public schema（租户 console）与 web_auth schema（平台运营，后续接入）
 * 各自实例化同一套列定义，外键落在各自 schema 内，互不混表。
 * 不要加 realm/app 标记把租户与平台行放进同一张表。
 */

type RefTable<C extends string = string> = Record<C, AnyPgColumn>

export const rolesColumns = (organizationRef: RefTable<"id">) => ({
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationRef.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  status: varchar("status", { length: 16 }).default("enabled").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const rolesConstraints = (table: {
  organizationId: AnyPgColumn
  code: AnyPgColumn
}) => [
  unique("roles_organization_id_code_uidx").on(table.organizationId, table.code),
  index("roles_organization_id_idx").on(table.organizationId),
]

export const rolePermissionsColumns = (roleRef: RefTable<"id">) => ({
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => roleRef.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 64 }).notNull(),
})

export const rolePermissionsConstraints = (table: {
  roleId: AnyPgColumn
  permission: AnyPgColumn
}) => [
  unique("role_permissions_role_id_permission_uidx").on(table.roleId, table.permission),
  index("role_permissions_role_id_idx").on(table.roleId),
]

export const memberRolesColumns = (
  organizationRef: RefTable<"id">,
  userRef: RefTable<"id">,
  roleRef: RefTable<"id">,
) => ({
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationRef.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => userRef.id, { onDelete: "cascade" }),
  roleId: text("role_id")
    .notNull()
    .references(() => roleRef.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const memberRolesConstraints = (table: {
  organizationId: AnyPgColumn
  userId: AnyPgColumn
  roleId: AnyPgColumn
}) => [
  unique("member_roles_org_user_role_uidx").on(
    table.organizationId,
    table.userId,
    table.roleId,
  ),
  index("member_roles_org_user_idx").on(table.organizationId, table.userId),
  index("member_roles_role_id_idx").on(table.roleId),
]

export const roleScopesColumns = (
  organizationRef: RefTable<"id">,
  roleRef: RefTable<"id">,
) => ({
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationRef.id, { onDelete: "cascade" }),
  roleId: text("role_id")
    .notNull()
    .references(() => roleRef.id, { onDelete: "cascade" }),
  scopeType: varchar("scope_type", { length: 16 }).notNull(),
  scopeRefId: text("scope_ref_id"),
  actions: jsonb("actions").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const roleScopesConstraints = (table: {
  organizationId: AnyPgColumn
  roleId: AnyPgColumn
}) => [
  index("role_scopes_org_idx").on(table.organizationId),
  index("role_scopes_role_id_idx").on(table.roleId),
]
