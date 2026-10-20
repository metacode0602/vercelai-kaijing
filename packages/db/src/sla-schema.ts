/**
 * 机房月度 SLA 域表结构（Drizzle ORM / PostgreSQL）
 *
 * 设计依据：
 * - apps/web/content/design/sla/datacenter-sla-implementation-design.md（v1.5+）
 * - apps/web/content/design/sla/sla-ops-direct-db-write-design.md
 *
 * 分层：
 * - L0：sla_import_batch / sla_bitable_sync_config / offline_bare_metal_order*
 * - L1：运维日事实 + 中台事件 + 故障设备明细
 * - L2：sla_fault_device_daily / sla_device_monthly / sla_datacenter_*_monthly
 * - 月报：查询时组装（方案 A）+ sla_monthly_report_compensation 手工覆盖
 *
 * 约定：
 * - 主键 text；卡时/台时/金额 numeric(15,4)；比率 numeric(8,6)
 * - 自然日 date（东八区业务日）；时间戳 timestamptz
 * - 合同 SLA（fault_sla_rate）与供给可用率（availability_rate）分列；sla_met 基于 fault_sla_rate
 */

import { relations } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { billingTenant, userStaff } from "./crm-schema"
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  dataCenter,
  gpuCardType,
  supplier,
  supplierDevice,
} from "./supply-schema"

/** 台时 / 卡时 / 金额 */
const hoursOrMoney = (name: string) => numeric(name, { precision: 15, scale: 4 })

/** SLA / 闲置 / 浪费 比率 */
const rate = (name: string) => numeric(name, { precision: 8, scale: 6 })

const slaTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

// ---------------------------------------------------------------------------
// L0 — 导入 / 配置 / 线下订单
// ---------------------------------------------------------------------------

export const slaImportBatch = pgTable(
  "sla_import_batch",
  {
    id: text("id").primaryKey(),
    sourceSystem: varchar("source_system", { length: 32 }).notNull(),
    datasetKind: varchar("dataset_kind", { length: 64 }).notNull(),
    statDate: date("stat_date"),
    slaMonth: varchar("sla_month", { length: 7 }),
    fileName: varchar("file_name", { length: 255 }),
    fileUri: varchar("file_uri", { length: 1024 }),
    importStatus: varchar("import_status", { length: 32 }).notNull(),
    parseError: text("parse_error"),
    rowCount: integer("row_count").notNull().default(0),
    committedRowCount: integer("committed_row_count").notNull().default(0),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...slaTimestamps,
  },
  (table) => [
    index("sla_import_batch_dataset_stat_date_idx").on(table.datasetKind, table.statDate),
    index("sla_import_batch_status_created_at_idx").on(table.importStatus, table.createdAt),
  ],
)

export const slaBitableSyncConfig = pgTable(
  "sla_bitable_sync_config",
  {
    id: text("id").primaryKey(),
    syncKind: varchar("sync_kind", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    appToken: varchar("app_token", { length: 128 }).notNull(),
    tableId: varchar("table_id", { length: 128 }).notNull(),
    viewId: varchar("view_id", { length: 128 }),
    fieldMappingJson: jsonb("field_mapping_json").notNull(),
    filterFormula: text("filter_formula"),
    cronExpr: varchar("cron_expr", { length: 64 }).notNull().default("30 * * * *"),
    autoCommit: boolean("auto_commit").notNull().default(false),
    cursorRecordId: varchar("cursor_record_id", { length: 128 }),
    cursorJson: jsonb("cursor_json").notNull().default({}),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_bitable_sync_config_kind_table_uk").on(
      table.syncKind,
      table.appToken,
      table.tableId,
    ),
    index("sla_bitable_sync_config_enabled_idx").on(table.enabled),
  ],
)

export const offlineBareMetalOrder = pgTable(
  "offline_bare_metal_order",
  {
    id: text("id").primaryKey(),
    orderNo: varchar("order_no", { length: 64 }).notNull(),
    customerFullName: varchar("customer_full_name", { length: 255 }).notNull(),
    contractNo: varchar("contract_no", { length: 128 }),
    tenantId: text("tenant_id").references(() => billingTenant.id, { onDelete: "set null" }),
    orderStatus: varchar("order_status", { length: 32 }).notNull().default("draft"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    expectedDeliveryAt: timestamp("expected_delivery_at", { withTimezone: true }),
    remark: text("remark"),
    totalDeviceCount: integer("total_device_count").notNull().default(0),
    totalGpuCount: integer("total_gpu_count").notNull().default(0),
    totalCost: hoursOrMoney("total_cost").notNull().default("0"),
    totalSlaCompensation: hoursOrMoney("total_sla_compensation").notNull().default("0"),
    createdByStaffId: text("created_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("offline_bare_metal_order_order_no_uk").on(table.orderNo),
    index("offline_bare_metal_order_status_idx").on(table.orderStatus),
    index("offline_bare_metal_order_ordered_at_idx").on(table.orderedAt),
  ],
)

export const offlineBareMetalOrderSupplyLine = pgTable(
  "offline_bare_metal_order_supply_line",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => offlineBareMetalOrder.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    cooperationType: varchar("cooperation_type", { length: 32 }).notNull().default("idle_time"),
    deviceCount: integer("device_count").notNull(),
    gpuCount: integer("gpu_count").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    accessoryFee: hoursOrMoney("accessory_fee").notNull().default("0"),
    slaCompensationAmount: hoursOrMoney("sla_compensation_amount").notNull().default("0"),
    lineCost: hoursOrMoney("line_cost").notNull().default("0"),
    capacityLineId: text("capacity_line_id"),
    remark: text("remark"),
    ...slaTimestamps,
  },
  (table) => [
    index("offline_bare_metal_order_supply_line_order_idx").on(table.orderId),
    index("offline_bare_metal_order_supply_line_dc_idx").on(table.dataCenterId, table.gpuCardTypeId),
  ],
)

// ---------------------------------------------------------------------------
// L1 — 运维故障 / 日事实
// ---------------------------------------------------------------------------

export const slaOpsFaultIncident = pgTable(
  "sla_ops_fault_incident",
  {
    id: text("id").primaryKey(),
    externalFaultId: varchar("external_fault_id", { length: 128 }).notNull(),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    /** datacenter / platform（月报影响范围） */
    scopeLabel: varchar("scope_label", { length: 32 }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    incidentStatus: varchar("incident_status", { length: 32 }).notNull(),
    parentExternalFaultId: varchar("parent_external_fault_id", { length: 128 }),
    parentIncidentId: text("parent_incident_id").references((): AnyPgColumn => slaOpsFaultIncident.id, {
      onDelete: "set null",
    }),
    faultCategory: varchar("fault_category", { length: 32 }).notNull(),
    faultType: varchar("fault_type", { length: 128 }).notNull(),
    faultOperator: varchar("fault_operator", { length: 128 }),
    remediation: text("remediation"),
    /** 故障复盘（月报「故障复盘」列） */
    postmortem: text("postmortem"),
    /** 事件级影响分钟；可空，可由设备子表 SUM 派生 */
    impactMinutes: integer("impact_minutes"),
    affectedDeviceCount: integer("affected_device_count").notNull().default(0),
    affectedGpuCount: integer("affected_gpu_count").notNull().default(0),
    affectedTenantIds: jsonb("affected_tenant_ids").notNull().default([]),
    affectedOrderIds: jsonb("affected_order_ids").notNull().default([]),
    faultCardHours: hoursOrMoney("fault_card_hours"),
    faultMachineHours: hoursOrMoney("fault_machine_hours"),
    impactSide: varchar("impact_side", { length: 16 }).notNull().default("external"),
    firstSeenDate: date("first_seen_date").notNull(),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_ops_fault_incident_external_uk").on(table.externalFaultId),
    index("sla_ops_fault_incident_dc_card_started_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.startedAt,
    ),
    index("sla_ops_fault_incident_status_ended_idx").on(table.incidentStatus, table.endedAt),
    index("sla_ops_fault_incident_first_seen_dc_idx").on(table.firstSeenDate, table.dataCenterId),
  ],
)

export const slaOpsFaultIncidentDevice = pgTable(
  "sla_ops_fault_incident_device",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => slaOpsFaultIncident.id, { onDelete: "cascade" }),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
    deviceSn: varchar("device_sn", { length: 64 }).notNull(),
    deviceAssetNo: varchar("device_asset_no", { length: 64 }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    gpuCount: integer("gpu_count").notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    deviceIncidentStatus: varchar("device_incident_status", { length: 32 }).notNull(),
    faultType: varchar("fault_type", { length: 128 }),
    faultCategory: varchar("fault_category", { length: 32 }),
    remediation: text("remediation"),
    impactMinutes: integer("impact_minutes"),
    faultMachineHours: hoursOrMoney("fault_machine_hours").notNull().default("0"),
    faultCardHours: hoursOrMoney("fault_card_hours").notNull().default("0"),
    impactSide: varchar("impact_side", { length: 16 }).notNull().default("external"),
    bareMetalOrderId: text("bare_metal_order_id").references(() => bareMetalOrder.id, {
      onDelete: "set null",
    }),
    bareMetalOrderDeviceId: text("bare_metal_order_device_id").references(
      () => bareMetalOrderDevice.id,
      { onDelete: "set null" },
    ),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_ops_fault_incident_device_incident_sn_uk").on(table.incidentId, table.deviceSn),
    index("sla_ops_fault_incident_device_supplier_device_idx").on(
      table.supplierDeviceId,
      table.startedAt,
    ),
    index("sla_ops_fault_incident_device_dc_card_started_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.startedAt,
    ),
  ],
)

export const slaOpsFaultDaily = pgTable(
  "sla_ops_fault_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    listKind: varchar("list_kind", { length: 16 }).notNull(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => slaOpsFaultIncident.id, { onDelete: "cascade" }),
    dataCenterId: text("data_center_id").notNull(),
    gpuCardTypeId: text("gpu_card_type_id").notNull(),
    snapshotStatus: varchar("snapshot_status", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sla_ops_fault_daily_uk").on(table.statDate, table.listKind, table.incidentId),
    index("sla_ops_fault_daily_dc_card_idx").on(
      table.statDate,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.listKind,
    ),
  ],
)

export const slaFaultCountDaily = pgTable(
  "sla_fault_count_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    newFaultCount: integer("new_fault_count").notNull().default(0),
    carryoverFaultCount: integer("carryover_fault_count").notNull().default(0),
    closedFaultCount: integer("closed_fault_count").notNull().default(0),
    resolvedFaultCount: integer("resolved_fault_count").notNull().default(0),
    newFaultDeviceCount: integer("new_fault_device_count").notNull().default(0),
    carryoverFaultDeviceCount: integer("carryover_fault_device_count").notNull().default(0),
    closedFaultDeviceCount: integer("closed_fault_device_count").notNull().default(0),
    newFaultByCategory: jsonb("new_fault_by_category").notNull().default({}),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_fault_count_daily_uk").on(
      table.statDate,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaScope,
    ),
  ],
)

export const slaSupplyDaily = pgTable(
  "sla_supply_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    totalMachineHours: hoursOrMoney("total_machine_hours").notNull(),
    totalCardHours: hoursOrMoney("total_card_hours").notNull(),
    contractCardHours: hoursOrMoney("contract_card_hours"),
    onboardingLossCardHours: hoursOrMoney("onboarding_loss_card_hours").notNull().default("0"),
    contractSource: varchar("contract_source", { length: 32 }),
    onlineDeviceCount: integer("online_device_count"),
    onlineGpuCount: integer("online_gpu_count"),
    source: varchar("source", { length: 32 }).notNull().default("ops_import"),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_supply_daily_uk").on(
      table.statDate,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaScope,
    ),
  ],
)

export const slaFaultCardHoursDaily = pgTable(
  "sla_fault_card_hours_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    impactSide: varchar("impact_side", { length: 16 }).notNull(),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    faultMachineHours: hoursOrMoney("fault_machine_hours").notNull(),
    faultCardHours: hoursOrMoney("fault_card_hours").notNull(),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_fault_card_hours_daily_uk").on(
      table.statDate,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaScope,
      table.impactSide,
    ),
  ],
)

export const slaUtilizationDaily = pgTable(
  "sla_utilization_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    serviceDeployCardHours: hoursOrMoney("service_deploy_card_hours").notNull().default("0"),
    bareMetalCardHours: hoursOrMoney("bare_metal_card_hours").notNull().default("0"),
    actualUsageCardHours: hoursOrMoney("actual_usage_card_hours").notNull(),
    totalSupplyCardHours: hoursOrMoney("total_supply_card_hours").notNull(),
    wasteCardHours: hoursOrMoney("waste_card_hours").notNull().default("0"),
    internalUsageCardHours: hoursOrMoney("internal_usage_card_hours").notNull().default("0"),
    idleCardHours: hoursOrMoney("idle_card_hours").notNull(),
    idleRate: rate("idle_rate"),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_utilization_daily_uk").on(
      table.statDate,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaScope,
    ),
  ],
)

export const slaWasteDaily = pgTable(
  "sla_waste_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    wasteMachineHours: hoursOrMoney("waste_machine_hours").notNull(),
    wasteCardHours: hoursOrMoney("waste_card_hours").notNull(),
    wasteRate: rate("waste_rate"),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_waste_daily_uk").on(
      table.statDate,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaScope,
    ),
  ],
)

export const slaOnboardingLoss = pgTable(
  "sla_onboarding_loss",
  {
    id: text("id").primaryKey(),
    externalRecordId: varchar("external_record_id", { length: 128 }).notNull(),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    deviceCount: integer("device_count").notNull(),
    gpuCount: integer("gpu_count").notNull(),
    opsReceivedAt: timestamp("ops_received_at", { withTimezone: true }).notNull(),
    actualShelvedAt: timestamp("actual_shelved_at", { withTimezone: true }).notNull(),
    lossHours: hoursOrMoney("loss_hours").notNull(),
    lossCardHours: hoursOrMoney("loss_card_hours").notNull(),
    supplierDeviceIds: jsonb("supplier_device_ids").notNull().default([]),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_onboarding_loss_external_uk").on(table.externalRecordId),
    index("sla_onboarding_loss_dc_card_received_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.opsReceivedAt,
    ),
  ],
)

// ---------------------------------------------------------------------------
// L1 — 中台事件
// ---------------------------------------------------------------------------

export const slaPlatformOfflineBaremetalIncident = pgTable(
  "sla_platform_offline_baremetal_incident",
  {
    id: text("id").primaryKey(),
    externalIncidentId: varchar("external_incident_id", { length: 128 }).notNull(),
    bitableRecordId: varchar("bitable_record_id", { length: 128 }),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    offlineBareMetalOrderId: text("offline_bare_metal_order_id").references(
      () => offlineBareMetalOrder.id,
      { onDelete: "set null" },
    ),
    offlineSupplyLineId: text("offline_supply_line_id").references(
      () => offlineBareMetalOrderSupplyLine.id,
      { onDelete: "set null" },
    ),
    reportReceivedAt: timestamp("report_received_at", { withTimezone: true }).notNull(),
    customerFullName: varchar("customer_full_name", { length: 255 }).notNull(),
    contractNo: varchar("contract_no", { length: 128 }),
    faultStartedAt: timestamp("fault_started_at", { withTimezone: true }).notNull(),
    faultEndedAt: timestamp("fault_ended_at", { withTimezone: true }),
    impactMinutes: integer("impact_minutes").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    responsibility: varchar("responsibility", { length: 32 }).notNull(),
    faultDescription: text("fault_description"),
    remediation: text("remediation"),
    isForceMajeureExempt: boolean("is_force_majeure_exempt").notNull().default(false),
    isCompensated: boolean("is_compensated").notNull().default(false),
    compensationAmount: hoursOrMoney("compensation_amount"),
    compensationWorkOrderId: varchar("compensation_work_order_id", { length: 128 }),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_platform_offline_baremetal_incident_external_uk").on(table.externalIncidentId),
  ],
)

export const slaPlatformOnlineIncident = pgTable(
  "sla_platform_online_incident",
  {
    id: text("id").primaryKey(),
    externalIncidentId: varchar("external_incident_id", { length: 128 }).notNull(),
    bitableRecordId: varchar("bitable_record_id", { length: 128 }),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    reportReceivedAt: timestamp("report_received_at", { withTimezone: true }).notNull(),
    tenantPlatformId: varchar("tenant_platform_id", { length: 128 }).notNull(),
    tenantId: text("tenant_id").references(() => billingTenant.id, { onDelete: "set null" }),
    faultStartedAt: timestamp("fault_started_at", { withTimezone: true }).notNull(),
    faultEndedAt: timestamp("fault_ended_at", { withTimezone: true }),
    impactMinutes: integer("impact_minutes").notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    productLine: varchar("product_line", { length: 32 }).notNull(),
    orderId: varchar("order_id", { length: 128 }),
    bareMetalOrderId: text("bare_metal_order_id").references(() => bareMetalOrder.id, {
      onDelete: "set null",
    }),
    affectedNodes: jsonb("affected_nodes").notNull().default([]),
    responsibility: varchar("responsibility", { length: 32 }).notNull(),
    faultDescription: text("fault_description"),
    remediation: text("remediation"),
    isForceMajeureExempt: boolean("is_force_majeure_exempt").notNull().default(false),
    isCompensated: boolean("is_compensated").notNull().default(false),
    compensationVoucherAmount: hoursOrMoney("compensation_voucher_amount"),
    compensationWorkOrderId: varchar("compensation_work_order_id", { length: 128 }),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_platform_online_incident_external_uk").on(table.externalIncidentId),
    index("sla_platform_online_incident_dc_card_started_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.faultStartedAt,
    ),
    index("sla_platform_online_incident_tenant_started_idx").on(
      table.tenantPlatformId,
      table.faultStartedAt,
    ),
  ],
)

export const slaPlatformInternalUsage = pgTable(
  "sla_platform_internal_usage",
  {
    id: text("id").primaryKey(),
    externalRecordId: varchar("external_record_id", { length: 128 }).notNull(),
    bitableRecordId: varchar("bitable_record_id", { length: 128 }),
    importBatchId: text("import_batch_id").references(() => slaImportBatch.id, {
      onDelete: "set null",
    }),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    actualStartedAt: timestamp("actual_started_at", { withTimezone: true }).notNull(),
    actualReturnedAt: timestamp("actual_returned_at", { withTimezone: true }),
    actualShelvedAt: timestamp("actual_shelved_at", { withTimezone: true }),
    department: varchar("department", { length: 128 }).notNull(),
    userName: varchar("user_name", { length: 128 }).notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    deviceCount: integer("device_count").notNull(),
    gpuCount: integer("gpu_count").notNull(),
    unitPrice: hoursOrMoney("unit_price").notNull(),
    totalAmount: hoursOrMoney("total_amount").notNull(),
    usageCardHours: hoursOrMoney("usage_card_hours"),
    listPricePerHour: hoursOrMoney("list_price_per_hour"),
    rawJson: jsonb("raw_json"),
    ...slaTimestamps,
  },
  (table) => [uniqueIndex("sla_platform_internal_usage_external_uk").on(table.externalRecordId)],
)

// ---------------------------------------------------------------------------
// L2 — 设备日/月 + 机房月汇总
// ---------------------------------------------------------------------------

export const slaFaultDeviceDaily = pgTable(
  "sla_fault_device_daily",
  {
    id: text("id").primaryKey(),
    statDate: date("stat_date").notNull(),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
    deviceSn: varchar("device_sn", { length: 64 }).notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    gpuCount: integer("gpu_count").notNull(),
    impactSide: varchar("impact_side", { length: 16 }).notNull(),
    faultMachineHours: hoursOrMoney("fault_machine_hours").notNull().default("0"),
    faultCardHours: hoursOrMoney("fault_card_hours").notNull().default("0"),
    supplyMachineHours: hoursOrMoney("supply_machine_hours").notNull().default("0"),
    supplyCardHours: hoursOrMoney("supply_card_hours").notNull(),
    /** 仅 external 行写入；§8.8 */
    deviceSlaRate: rate("device_sla_rate"),
    incidentCount: integer("incident_count").notNull().default(0),
    sourceIncidentDeviceIds: jsonb("source_incident_device_ids").notNull().default([]),
    rollupAt: timestamp("rollup_at", { withTimezone: true }).notNull(),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_fault_device_daily_uk").on(table.statDate, table.deviceSn, table.impactSide),
    index("sla_fault_device_daily_supplier_device_idx").on(table.supplierDeviceId, table.statDate),
    index("sla_fault_device_daily_dc_card_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.statDate,
    ),
  ],
)

export const slaDeviceMonthly = pgTable(
  "sla_device_monthly",
  {
    id: text("id").primaryKey(),
    slaMonth: varchar("sla_month", { length: 7 }).notNull(),
    supplierDeviceId: text("supplier_device_id").references(() => supplierDevice.id, {
      onDelete: "set null",
    }),
    deviceSn: varchar("device_sn", { length: 64 }).notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    gpuCount: integer("gpu_count").notNull(),
    activeDays: integer("active_days").notNull().default(0),
    externalFaultMachineHours: hoursOrMoney("external_fault_machine_hours").notNull().default("0"),
    internalFaultMachineHours: hoursOrMoney("internal_fault_machine_hours").notNull().default("0"),
    externalFaultCardHours: hoursOrMoney("external_fault_card_hours").notNull().default("0"),
    internalFaultCardHours: hoursOrMoney("internal_fault_card_hours").notNull().default("0"),
    supplyMachineHours: hoursOrMoney("supply_machine_hours").notNull(),
    supplyCardHours: hoursOrMoney("supply_card_hours").notNull(),
    deviceSlaRate: rate("device_sla_rate"),
    /** 基于 device_sla_rate（合同 SLA）；阈值 P2 */
    slaMet: boolean("sla_met"),
    rollupStatus: varchar("rollup_status", { length: 32 }).notNull(),
    rollupAt: timestamp("rollup_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_device_monthly_month_sn_uk").on(table.slaMonth, table.deviceSn),
    index("sla_device_monthly_supplier_device_idx").on(table.supplierDeviceId, table.slaMonth),
    index("sla_device_monthly_dc_card_idx").on(
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaMonth,
    ),
  ],
)

const monthlyMetricColumns = {
  contractCardHours: hoursOrMoney("contract_card_hours").notNull(),
  totalSupplyCardHours: hoursOrMoney("total_supply_card_hours").notNull(),
  totalSupplyMachineHours: hoursOrMoney("total_supply_machine_hours").notNull(),
  onboardingLossCardHours: hoursOrMoney("onboarding_loss_card_hours").notNull(),
  newFaultCount: integer("new_fault_count").notNull(),
  carryoverFaultCountEnd: integer("carryover_fault_count_end").notNull(),
  closedFaultCount: integer("closed_fault_count").notNull(),
  newFaultDeviceCount: integer("new_fault_device_count").notNull(),
  carryoverFaultDeviceCountEnd: integer("carryover_fault_device_count_end").notNull(),
  externalFaultCardHours: hoursOrMoney("external_fault_card_hours").notNull(),
  internalFaultCardHours: hoursOrMoney("internal_fault_card_hours").notNull(),
  actualUsageCardHours: hoursOrMoney("actual_usage_card_hours").notNull(),
  idleCardHours: hoursOrMoney("idle_card_hours").notNull(),
  idleRateAvg: rate("idle_rate_avg"),
  wasteCardHours: hoursOrMoney("waste_card_hours").notNull(),
  wasteRateAvg: rate("waste_rate_avg"),
  internalUsageCardHours: hoursOrMoney("internal_usage_card_hours").notNull(),
  onboardingLossEventCount: integer("onboarding_loss_event_count").notNull(),
  platformOfflineIncidentCount: integer("platform_offline_incident_count").notNull(),
  platformOnlineIncidentCount: integer("platform_online_incident_count").notNull(),
  compensationAmountTotal: hoursOrMoney("compensation_amount_total").notNull(),
  exemptIncidentCount: integer("exempt_incident_count").notNull(),
  /** §8.1 供给可用率 = 供给 / 合同 */
  availabilityRate: rate("availability_rate"),
  /** §8.3.1 合同 SLA = (供给 − 外部故障) / 供给 */
  faultSlaRate: rate("fault_sla_rate"),
  /** 基于 fault_sla_rate 判达标 */
  slaMet: boolean("sla_met"),
  rollupStatus: varchar("rollup_status", { length: 32 }).notNull(),
  rollupAt: timestamp("rollup_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
}

export const slaDatacenterCardTypeMonthly = pgTable(
  "sla_datacenter_card_type_monthly",
  {
    id: text("id").primaryKey(),
    slaMonth: varchar("sla_month", { length: 7 }).notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    gpuCardTypeId: text("gpu_card_type_id")
      .notNull()
      .references(() => gpuCardType.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
    ...monthlyMetricColumns,
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_datacenter_card_type_monthly_uk").on(
      table.slaMonth,
      table.dataCenterId,
      table.gpuCardTypeId,
      table.slaScope,
    ),
  ],
)

export const slaDatacenterMonthly = pgTable(
  "sla_datacenter_monthly",
  {
    id: text("id").primaryKey(),
    slaMonth: varchar("sla_month", { length: 7 }).notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    slaScope: varchar("sla_scope", { length: 32 }).notNull().default("all"),
    supplierId: text("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
    ...monthlyMetricColumns,
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_datacenter_monthly_uk").on(table.slaMonth, table.dataCenterId, table.slaScope),
    index("sla_datacenter_monthly_supplier_idx").on(table.supplierId, table.slaMonth),
  ],
)

/**
 * 月度 SLA 报告赔偿手工覆盖（方案 A）
 * group_key = 'platform' | device_sn
 */
export const slaMonthlyReportCompensation = pgTable(
  "sla_monthly_report_compensation",
  {
    id: text("id").primaryKey(),
    slaMonth: varchar("sla_month", { length: 7 }).notNull(),
    dataCenterId: text("data_center_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    groupKey: varchar("group_key", { length: 128 }).notNull(),
    serviceFee: hoursOrMoney("service_fee"),
    compensationTier: rate("compensation_tier"),
    compensationAmount: hoursOrMoney("compensation_amount"),
    compensationNote: text("compensation_note"),
    updatedByStaffId: text("updated_by_staff_id").references(() => userStaff.id, {
      onDelete: "set null",
    }),
    ...slaTimestamps,
  },
  (table) => [
    uniqueIndex("sla_monthly_report_compensation_uk").on(
      table.slaMonth,
      table.dataCenterId,
      table.groupKey,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Relations（节选，供 ORM 联表）
// ---------------------------------------------------------------------------

export const slaOpsFaultIncidentRelations = relations(slaOpsFaultIncident, ({ many, one }) => ({
  devices: many(slaOpsFaultIncidentDevice),
  dataCenter: one(dataCenter, {
    fields: [slaOpsFaultIncident.dataCenterId],
    references: [dataCenter.id],
  }),
}))

export const slaOpsFaultIncidentDeviceRelations = relations(
  slaOpsFaultIncidentDevice,
  ({ one }) => ({
    incident: one(slaOpsFaultIncident, {
      fields: [slaOpsFaultIncidentDevice.incidentId],
      references: [slaOpsFaultIncident.id],
    }),
  }),
)

export const offlineBareMetalOrderRelations = relations(offlineBareMetalOrder, ({ many }) => ({
  supplyLines: many(offlineBareMetalOrderSupplyLine),
}))

export const offlineBareMetalOrderSupplyLineRelations = relations(
  offlineBareMetalOrderSupplyLine,
  ({ one }) => ({
    order: one(offlineBareMetalOrder, {
      fields: [offlineBareMetalOrderSupplyLine.orderId],
      references: [offlineBareMetalOrder.id],
    }),
  }),
)
