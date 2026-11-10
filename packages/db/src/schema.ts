import * as authSchema from "./auth-schema"
import * as feishuSchema from "./feishu-schema"
import * as commerceSchema from "./commerce-schema"
import * as rbacSchema from "./rbac-schema"

export * from "./auth-schema"
export * from "./feishu-schema"
export * from "./commerce-schema"
export * from "./rbac-schema"

/** 显式交叉类型，避免 TS7056 同时保留各表导出类型 */
export type AppDbSchema = typeof authSchema & typeof feishuSchema & typeof commerceSchema & typeof rbacSchema

export const schema: AppDbSchema = {
  ...authSchema,
  ...feishuSchema,
  ...commerceSchema,
  ...rbacSchema,
}
