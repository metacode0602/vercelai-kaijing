import * as authSchema from "./auth-schema"
import * as feishuSchema from "./feishu-schema"

export * from "./auth-schema"
export * from "./feishu-schema"

/** 显式交叉类型，避免 TS7056 同时保留各表导出类型 */
export type AppDbSchema = typeof authSchema & typeof feishuSchema

export const schema: AppDbSchema = {
  ...authSchema,
  ...feishuSchema,
}
