import { relations } from "drizzle-orm"
import { pgSchema, type AnyPgColumn } from "drizzle-orm/pg-core"
import {
  accountColumns,
  accountIndexes,
  invitationColumns,
  invitationIndexes,
  memberColumns,
  organizationColumns,
  sessionColumns,
  sessionIndexes,
  usersColumns,
  verificationColumns,
  verificationIndexes,
} from "./auth-columns"

/**
 * apps/web 平台管理员身份库（与租户侧 public schema 物理隔离）。
 *
 * 同库不同 schema：租户账号在 public.users，平台管理员在 web_auth.users，
 * 两套互不可见、互不查询。列定义与 public 侧同源（auth-columns.ts），
 * 保证 better-auth 所需字段一致。
 *
 * apps/web 必须用独立的 drizzle 实例（client.ts 的 webAuthDb）+ 下面的
 * webAuthAdapterSchema 初始化 better-auth：adapter 的 join 查询按
 * `db.query[model]` 解析，若复用 public 聚合 schema 的 db 实例，
 * model "user" 会命中 public.users，隔离即被绕过。
 */

export const webAuthSchema = pgSchema("web_auth")

export const webUser = webAuthSchema.table("users", usersColumns())

// organization 先于 session/member/invitation 定义（传引用，非懒回调）
export const webOrganization = webAuthSchema.table(
  "organization",
  organizationColumns((): AnyPgColumn => webOrganization.id)
)

export const webSession = webAuthSchema.table(
  "session",
  sessionColumns(webUser, webOrganization),
  (table) => sessionIndexes(table)
)

export const webAccount = webAuthSchema.table(
  "account",
  accountColumns(webUser),
  (table) => accountIndexes(table)
)

export const webVerification = webAuthSchema.table(
  "verification",
  verificationColumns(),
  (table) => verificationIndexes(table)
)

export const webMember = webAuthSchema.table(
  "member",
  memberColumns(webOrganization, webUser)
)

export const webInvitation = webAuthSchema.table(
  "invitation",
  invitationColumns(webOrganization, webUser),
  (table) => invitationIndexes(table)
)

export const webUserRelations = relations(webUser, ({ many }) => ({
  sessions: many(webSession),
  accounts: many(webAccount),
}))

export const webSessionRelations = relations(webSession, ({ one }) => ({
  user: one(webUser, {
    fields: [webSession.userId],
    references: [webUser.id],
  }),
}))

export const webAccountRelations = relations(webAccount, ({ one }) => ({
  user: one(webUser, {
    fields: [webAccount.userId],
    references: [webUser.id],
  }),
}))

export const webMemberRelations = relations(webMember, ({ one }) => ({
  organization: one(webOrganization, {
    fields: [webMember.organizationId],
    references: [webOrganization.id],
  }),
  user: one(webUser, {
    fields: [webMember.userId],
    references: [webUser.id],
  }),
}))

export const webOrganizationRelations = relations(webOrganization, ({
  many,
}) => ({
  members: many(webMember),
}))

/**
 * better-auth 模型名 → web_auth 表/关系。
 *
 * 键名必须是 better-auth 的单数模型名（user/session/account/verification/
 * organization/member/invitation），不能用 webUser 等导出名：
 * adapter 的 getSchema(model) 按模型名取表。
 *
 * 同时作为 webAuthDb 的 drizzle schema（client.ts），db.query 键名即这些
 * 模型名，getQueryModel 才会命中 web_auth 表而非 public 表。
 */
export const webAuthAdapterSchema = {
  user: webUser,
  session: webSession,
  account: webAccount,
  verification: webVerification,
  organization: webOrganization,
  member: webMember,
  invitation: webInvitation,
  webUserRelations,
  webSessionRelations,
  webAccountRelations,
  webMemberRelations,
  webOrganizationRelations,
}
