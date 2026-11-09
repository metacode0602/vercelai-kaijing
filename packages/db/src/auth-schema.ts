import { relations } from "drizzle-orm"
import { pgTable, text, timestamp, boolean, index, varchar, integer, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core"
import { createId } from '@paralleldrive/cuid2'
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

// ---------------------------------------------------------------------------
// 组织类型枚举
// ---------------------------------------------------------------------------

export const orgTypes = ['platform', 'supplier', 'merchant', 'tenant'] as const
export type OrgType = (typeof orgTypes)[number]

export const user = pgTable("users", usersColumns())

// 列定义复用见 auth-columns.ts；organization 需先于 session 定义（传引用非懒回调）
export const organization = pgTable(
  'organization',
  organizationColumns((): AnyPgColumn => organization.id)
)

export const session = pgTable(
  "session",
  sessionColumns(user, organization),
  (table) => sessionIndexes(table)
)

export const account = pgTable(
  "account",
  accountColumns(user),
  (table) => accountIndexes(table)
)

export const verification = pgTable(
  "verification",
  verificationColumns(),
  (table) => verificationIndexes(table)
)


export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))



/**
 * 用户邀请码表 - 存储用户的邀请码信息
 */
export const userInvitationCodes = pgTable(
  'user_invitation_codes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    code: varchar('code', { length: 20 }).notNull().unique(), // 邀请码，6-8位随机字符串
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'), // 可选过期时间
    isActive: boolean('is_active').notNull().default(true),
    usageCount: integer('usage_count').notNull().default(0), // 被使用的次数
    maxUsage: integer('max_usage'), // 最大使用次数限制，NULL表示无限制
  },
  (table) => [
    index('user_invitation_codes_user_id_idx').on(table.userId),
    index('user_invitation_codes_code_idx').on(table.code),
    index('user_invitation_codes_active_idx').on(table.isActive),
  ]
)

/**
 * 用户邀请关系表 - 存储用户间的邀请关系
 */
export const userInvitationRelations = pgTable(
  'user_invitation_relations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    inviteeId: text('invitee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    invitationCodeId: text('invitation_code_id')
      .references(() => userInvitationCodes.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, cancelled
    rewardGranted: boolean('reward_granted').notNull().default(false), // 是否已发放奖励
    metadata: jsonb('metadata').default({}), // 扩展字段
  },
  (table) => [
    index('user_invitation_relations_inviter_idx').on(table.inviterId),
    index('user_invitation_relations_invitee_idx').on(table.inviteeId),
    index('user_invitation_relations_code_idx').on(table.invitationCodeId),
    index('user_invitation_relations_unique_idx').on(table.inviterId, table.inviteeId),
  ]
)

// 邀请码表的关系定义
export const userInvitationCodesRelations = relations(userInvitationCodes, ({ one, many }) => ({
  user: one(user, {
    fields: [userInvitationCodes.userId],
    references: [user.id],
  }),
  relations: many(userInvitationRelations),
}))

// 邀请关系表的关系定义
export const userInvitationRelationsRelations = relations(userInvitationRelations, ({ one }) => ({
  inviter: one(user, {
    fields: [userInvitationRelations.inviterId],
    references: [user.id],
  }),
  invitee: one(user, {
    fields: [userInvitationRelations.inviteeId],
    references: [user.id],
  }),
  invitationCode: one(userInvitationCodes, {
    fields: [userInvitationRelations.invitationCodeId],
    references: [userInvitationCodes.id],
  }),
}))

// 类型导出
export type UserInvitationCode = typeof userInvitationCodes.$inferSelect
export type NewUserInvitationCode = typeof userInvitationCodes.$inferInsert
export type UserInvitationRelation = typeof userInvitationRelations.$inferSelect
export type NewUserInvitationRelation = typeof userInvitationRelations.$inferInsert

export type Organization = typeof organization.$inferSelect

export const member = pgTable('member', memberColumns(organization, user))


export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}))

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
}))

export type Member = typeof member.$inferSelect & {
  user: typeof user.$inferSelect
}

export const invitation = pgTable(
  'invitation',
  invitationColumns(organization, user),
  (table) => invitationIndexes(table)
)


export enum Role {
  Admin = 'admin',
  Member = 'member',
}

export type SiteMessageLinkRecord = {
  label: string
  href: string
  external?: boolean
}

/**
 * CRM 用户站内信（收件箱）
 */
export const userSiteMessage = pgTable(
  'user_site_message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    summary: text('summary').notNull(),
    content: text('content').notNull(),
    category: varchar('category', { length: 32 }),
    links: jsonb('links').$type<SiteMessageLinkRecord[]>().notNull().default([]),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('user_site_message_user_created_idx').on(table.userId, table.createdAt),
    index('user_site_message_user_read_idx').on(table.userId, table.read),
  ],
)

export const userSiteMessageRelations = relations(userSiteMessage, ({ one }) => ({
  user: one(user, {
    fields: [userSiteMessage.userId],
    references: [user.id],
  }),
}))

export type UserSiteMessage = typeof userSiteMessage.$inferSelect
export type NewUserSiteMessage = typeof userSiteMessage.$inferInsert