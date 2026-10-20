import * as authSchema from "./auth-schema"
import * as computeSchema from "./compute-schema"
import * as crmSchema from "./crm-schema"
import * as financeSchema from "./finance-schema"
import * as gpusConsumerSchema from "./gpus-consumer-schema"
import * as platformPricingSchema from "./platform-pricing-schema"
import * as merchantSchema from "./merchant-schema"
import * as supplySchema from "./supply-schema"

import * as feishuSchema from "./feishu-schema"
import * as schedulingSchema from "./scheduling-schema"
import * as slaSchema from "./sla-schema"
import * as waverlessBillingSchema from "./waverless-billing-schema"

export * from "./auth-schema"
export * from "./compute-schema"
export * from "./crm-schema"
export * from "./finance-schema"
export * from "./gpus-consumer-schema"
export * from "./platform-pricing-schema"
export * from "./merchant-schema"
export * from "./supply-schema"

export * from "./supply-lifecycle-dictionary"
export * from "./feishu-schema"
export * from "./scheduling-schema"
export * from "./sla-schema"
export * from "./waverless-billing-schema"

/** 显式交叉类型，避免 TS7056 同时保留各表导出类型 */
export type AppDbSchema = typeof authSchema &
  typeof computeSchema &
  typeof crmSchema &
  typeof merchantSchema &
  typeof supplySchema &

  typeof financeSchema &
  typeof gpusConsumerSchema &
  typeof platformPricingSchema &
  typeof feishuSchema &
  typeof schedulingSchema &
  typeof slaSchema &
  typeof waverlessBillingSchema

export const schema: AppDbSchema = {
  ...authSchema,
  ...computeSchema,
  ...crmSchema,
  ...merchantSchema,
  ...supplySchema,

  ...financeSchema,
  ...gpusConsumerSchema,
  ...platformPricingSchema,
  ...feishuSchema,
  ...schedulingSchema,
  ...slaSchema,
  ...waverlessBillingSchema,
}
