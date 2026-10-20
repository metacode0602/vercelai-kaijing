-- =============================================================================
-- SLA 运维直写域 — PostgreSQL 建表脚本（设计稿）
-- =============================================================================
-- 文档：sla-ops-direct-db-write-design.md §5.13
-- 版本：v1.6 | 日期：2026-07-17
-- 说明：
--   - **权威实现**：packages/db/src/sla-schema.ts + drizzle/0022_*.sql
--   - 本脚本为运维侧参考 DDL；列名冲突以 sla-schema.ts 为准
--     （supply_* / device_sla_rate / fault_sla_rate；勿再用 eligible_*）
--   - 中台 / 线下订单 / 月报赔偿表见 sla-schema.ts
--   - 枚举列以 varchar 存储；外键附录由 Drizzle migration 追加
--
-- 本脚本覆盖的运维核心表：
--   sla_import_batch, sla_ops_fault_incident, sla_ops_fault_incident_device,
--   sla_supply_daily, sla_fault_card_hours_daily, sla_utilization_daily,
--   sla_waste_daily, sla_onboarding_loss,
--   sla_ops_fault_daily, sla_fault_count_daily, sla_fault_device_daily,
--   sla_device_monthly, sla_datacenter_card_type_monthly
-- =============================================================================

-- =============================================================================
-- 第一部分：运维直写表
-- =============================================================================

-- -----------------------------------------------------------------------------
-- sla_import_batch — 导入批次（可选）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" varchar(32) NOT NULL,
	"dataset_kind" varchar(64) NOT NULL,
	"stat_date" date,
	"sla_month" varchar(7),
	"file_name" varchar(255),
	"file_uri" varchar(1024),
	"import_status" varchar(32) NOT NULL,
	"parse_error" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"committed_row_count" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_import_batch" IS 'SLA 导入批次（可选）；登记运维每次直写批次，便于追溯';
COMMENT ON COLUMN "sla_import_batch"."id" IS '主键；批次 ID';
COMMENT ON COLUMN "sla_import_batch"."source_system" IS '来源系统；运维直写固定 ops';
COMMENT ON COLUMN "sla_import_batch"."dataset_kind" IS '数据集类型；见设计文档 §5.2.1（如 ops_supply_daily）';
COMMENT ON COLUMN "sla_import_batch"."stat_date" IS '业务日；日数据集必填（东八区自然日）';
COMMENT ON COLUMN "sla_import_batch"."sla_month" IS '自然月；格式 YYYY-MM，月补录时使用';
COMMENT ON COLUMN "sla_import_batch"."file_name" IS '脚本或源文件名';
COMMENT ON COLUMN "sla_import_batch"."file_uri" IS '源文件 URI（可选）';
COMMENT ON COLUMN "sla_import_batch"."import_status" IS '导入状态；运维直写固定 committed';
COMMENT ON COLUMN "sla_import_batch"."parse_error" IS '解析错误信息（可选）';
COMMENT ON COLUMN "sla_import_batch"."row_count" IS '解析行数';
COMMENT ON COLUMN "sla_import_batch"."committed_row_count" IS '已提交行数';
COMMENT ON COLUMN "sla_import_batch"."committed_at" IS '提交时间';
COMMENT ON COLUMN "sla_import_batch"."created_by_staff_id" IS '创建人员工 ID；FK→user_staff，API 场景用，运维可空';
COMMENT ON COLUMN "sla_import_batch"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_import_batch"."updated_at" IS '更新时间';

CREATE INDEX "sla_import_batch_dataset_stat_date_idx"
	ON "sla_import_batch" USING btree ("dataset_kind", "stat_date");
CREATE INDEX "sla_import_batch_status_created_at_idx"
	ON "sla_import_batch" USING btree ("import_status", "created_at");


-- -----------------------------------------------------------------------------
-- sla_ops_fault_incident — 运维故障事件
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_ops_fault_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"external_fault_id" varchar(128) NOT NULL,
	"import_batch_id" text,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"scope_label" varchar(32),
	"discovered_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"incident_status" varchar(32) NOT NULL,
	"parent_external_fault_id" varchar(128),
	"parent_incident_id" text,
	"fault_category" varchar(32) NOT NULL,
	"fault_type" varchar(128) NOT NULL,
	"fault_operator" varchar(128),
	"remediation" text,
	"affected_device_count" integer DEFAULT 0 NOT NULL,
	"affected_gpu_count" integer DEFAULT 0 NOT NULL,
	"affected_tenant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_order_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fault_card_hours" numeric(15, 4),
	"fault_machine_hours" numeric(15, 4),
	"impact_side" varchar(16) DEFAULT 'external' NOT NULL,
	"first_seen_date" date NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_ops_fault_incident" IS '运维故障事件；一条记录=一个故障事件，幂等键 external_fault_id';
COMMENT ON COLUMN "sla_ops_fault_incident"."id" IS '主键；全局唯一';
COMMENT ON COLUMN "sla_ops_fault_incident"."external_fault_id" IS '幂等键；运维工单号或 OPS-FAULT-{yyyyMMdd}-{seq}';
COMMENT ON COLUMN "sla_ops_fault_incident"."import_batch_id" IS '导入批次 ID；FK→sla_import_batch，可选';
COMMENT ON COLUMN "sla_ops_fault_incident"."supplier_id" IS '供应商 ID；FK→supplier，冗余自 data_center';
COMMENT ON COLUMN "sla_ops_fault_incident"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_ops_fault_incident"."gpu_card_type_id" IS '事件主卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_ops_fault_incident"."sla_scope" IS '统计范围；默认 all，见 §5.0.1';
COMMENT ON COLUMN "sla_ops_fault_incident"."scope_label" IS '范围标签；datacenter / platform，可选';
COMMENT ON COLUMN "sla_ops_fault_incident"."discovered_at" IS '发现时间';
COMMENT ON COLUMN "sla_ops_fault_incident"."started_at" IS '故障开始时间（事件级）';
COMMENT ON COLUMN "sla_ops_fault_incident"."ended_at" IS '故障结束时间；NULL=进行中';
COMMENT ON COLUMN "sla_ops_fault_incident"."incident_status" IS '事件状态；ongoing/resolved/temporarily_resolved/closed';
COMMENT ON COLUMN "sla_ops_fault_incident"."parent_external_fault_id" IS '父级故障外部标识（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident"."parent_incident_id" IS '父级故障 ID；FK→本表，CRM 解析后回填，运维不写';
COMMENT ON COLUMN "sla_ops_fault_incident"."fault_category" IS '故障类别；network/hardware/human';
COMMENT ON COLUMN "sla_ops_fault_incident"."fault_type" IS '故障类型；运维字典';
COMMENT ON COLUMN "sla_ops_fault_incident"."fault_operator" IS '故障运营（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident"."remediation" IS '处理措施摘要（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident"."affected_device_count" IS '影响设备数；=设备子表行数';
COMMENT ON COLUMN "sla_ops_fault_incident"."affected_gpu_count" IS '影响 GPU 卡数；=SUM(设备.gpu_count)';
COMMENT ON COLUMN "sla_ops_fault_incident"."affected_tenant_ids" IS '影响租户 ID 列表；jsonb 数组';
COMMENT ON COLUMN "sla_ops_fault_incident"."affected_order_ids" IS '影响订单 ID 列表；jsonb 数组';
COMMENT ON COLUMN "sla_ops_fault_incident"."fault_card_hours" IS '事件级故障卡时；默认 SUM(设备子表)';
COMMENT ON COLUMN "sla_ops_fault_incident"."fault_machine_hours" IS '事件级故障台时；默认 SUM(设备子表)';
COMMENT ON COLUMN "sla_ops_fault_incident"."impact_side" IS '故障影响侧；internal/external，默认 external';
COMMENT ON COLUMN "sla_ops_fault_incident"."first_seen_date" IS '首次入库业务日；判新增故障用';
COMMENT ON COLUMN "sla_ops_fault_incident"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_ops_fault_incident"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_ops_fault_incident"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_ops_fault_incident_external_fault_id_uk"
	ON "sla_ops_fault_incident" USING btree ("external_fault_id");
CREATE INDEX "sla_ops_fault_incident_dc_card_started_at_idx"
	ON "sla_ops_fault_incident" USING btree ("data_center_id", "gpu_card_type_id", "started_at");
CREATE INDEX "sla_ops_fault_incident_status_ended_at_idx"
	ON "sla_ops_fault_incident" USING btree ("incident_status", "ended_at");
CREATE INDEX "sla_ops_fault_incident_first_seen_dc_idx"
	ON "sla_ops_fault_incident" USING btree ("first_seen_date", "data_center_id");

ALTER TABLE "sla_ops_fault_incident"
	ADD CONSTRAINT "sla_ops_fault_incident_import_batch_id_sla_import_batch_id_fk"
	FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id")
	ON DELETE set null ON UPDATE no action;
ALTER TABLE "sla_ops_fault_incident"
	ADD CONSTRAINT "sla_ops_fault_incident_parent_incident_id_sla_ops_fault_incident_id_fk"
	FOREIGN KEY ("parent_incident_id") REFERENCES "public"."sla_ops_fault_incident"("id")
	ON DELETE set null ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_ops_fault_incident_device — 故障 × 设备明细（P0 设备 SLA 真源）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_ops_fault_incident_device" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"supplier_device_id" text,
	"device_sn" varchar(64) NOT NULL,
	"device_asset_no" varchar(64),
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"device_incident_status" varchar(32) NOT NULL,
	"fault_type" varchar(128),
	"fault_category" varchar(32),
	"remediation" text,
	"impact_minutes" integer,
	"fault_machine_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"fault_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"impact_side" varchar(16) DEFAULT 'external' NOT NULL,
	"bare_metal_order_id" text,
	"bare_metal_order_device_id" text,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_ops_fault_incident_device" IS '故障×设备明细；每台受影响设备一行，须在事件之后写入；P0 设备 SLA 真源';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."id" IS '主键';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."incident_id" IS '父故障事件 ID；FK→sla_ops_fault_incident';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."supplier_device_id" IS '物理机 ID；FK→supplier_device，SN 匹配成功时填';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."device_sn" IS '设备 SN；运维匹配键，UK 组成部分';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."device_asset_no" IS '资产编号（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."data_center_id" IS '机房 ID；冗余校验';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."gpu_card_type_id" IS '卡型 ID；冗余校验';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."gpu_count" IS '该设备 GPU 卡数';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."discovered_at" IS '该设备故障发现时间';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."started_at" IS '该设备故障开始时间';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."ended_at" IS '该设备故障结束时间；NULL=进行中';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."device_incident_status" IS '该设备故障状态；可与事件级不同';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."fault_type" IS '设备级故障类型；空则继承事件';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."fault_category" IS '设备级故障类别（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."remediation" IS '该设备处理措施（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."impact_minutes" IS '该设备影响分钟数（可选）';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."fault_machine_hours" IS '该设备故障台时';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."fault_card_hours" IS '该设备故障卡时；台时×gpu_count 或运维直传';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."impact_side" IS '影响侧；internal/external，设备 SLA 达标看 external';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."bare_metal_order_id" IS '裸金属订单 ID；FK→bare_metal_order，可选';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."bare_metal_order_device_id" IS '裸金属订单设备 ID；FK→bare_metal_order_device，可选';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_ops_fault_incident_device"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_ops_fault_incident_device_incident_sn_uk"
	ON "sla_ops_fault_incident_device" USING btree ("incident_id", "device_sn");
CREATE INDEX "sla_ops_fault_incident_device_supplier_device_started_at_idx"
	ON "sla_ops_fault_incident_device" USING btree ("supplier_device_id", "started_at");
CREATE INDEX "sla_ops_fault_incident_device_incident_id_idx"
	ON "sla_ops_fault_incident_device" USING btree ("incident_id");
CREATE INDEX "sla_ops_fault_incident_device_dc_card_started_at_idx"
	ON "sla_ops_fault_incident_device" USING btree ("data_center_id", "gpu_card_type_id", "started_at");

ALTER TABLE "sla_ops_fault_incident_device"
	ADD CONSTRAINT "sla_ops_fault_incident_device_incident_id_sla_ops_fault_incident_id_fk"
	FOREIGN KEY ("incident_id") REFERENCES "public"."sla_ops_fault_incident"("id")
	ON DELETE cascade ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_supply_daily — 日供给与合同卡时（机房×卡型×日）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_supply_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"import_batch_id" text,
	"total_machine_hours" numeric(15, 4) NOT NULL,
	"total_card_hours" numeric(15, 4) NOT NULL,
	"contract_card_hours" numeric(15, 4),
	"onboarding_loss_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"contract_source" varchar(32),
	"online_device_count" integer,
	"online_gpu_count" integer,
	"source" varchar(32) DEFAULT 'ops_import' NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_supply_daily" IS '日供给与合同卡时；粒度=机房×卡型×自然日×sla_scope';
COMMENT ON COLUMN "sla_supply_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_supply_daily"."stat_date" IS '业务日（东八区自然日）';
COMMENT ON COLUMN "sla_supply_daily"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_supply_daily"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_supply_daily"."sla_scope" IS '统计范围；默认 all';
COMMENT ON COLUMN "sla_supply_daily"."import_batch_id" IS '导入批次 ID；FK→sla_import_batch，可选';
COMMENT ON COLUMN "sla_supply_daily"."total_machine_hours" IS '总供给台时；运维直写';
COMMENT ON COLUMN "sla_supply_daily"."total_card_hours" IS '总供给卡时；运维直写；须满足供给恒等式';
COMMENT ON COLUMN "sla_supply_daily"."contract_card_hours" IS '合同卡时；由 CRM Job 自 supplier_contract_capacity_line 写入，运维勿写';
COMMENT ON COLUMN "sla_supply_daily"."onboarding_loss_card_hours" IS '当日上架损耗卡时；运维直写';
COMMENT ON COLUMN "sla_supply_daily"."contract_source" IS '合同卡时来源；如 capacity_contract_job，运维勿写';
COMMENT ON COLUMN "sla_supply_daily"."online_device_count" IS '在线设备数；辅助字段，可选';
COMMENT ON COLUMN "sla_supply_daily"."online_gpu_count" IS '在线 GPU 数；辅助字段，可选';
COMMENT ON COLUMN "sla_supply_daily"."source" IS '数据来源；运维固定 ops_import';
COMMENT ON COLUMN "sla_supply_daily"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_supply_daily"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_supply_daily"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_supply_daily_stat_scope_uk"
	ON "sla_supply_daily" USING btree ("stat_date", "data_center_id", "gpu_card_type_id", "sla_scope");

ALTER TABLE "sla_supply_daily"
	ADD CONSTRAINT "sla_supply_daily_import_batch_id_sla_import_batch_id_fk"
	FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id")
	ON DELETE set null ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_fault_card_hours_daily — 日故障卡时（机房×卡型×影响侧）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_fault_card_hours_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"impact_side" varchar(16) NOT NULL,
	"import_batch_id" text,
	"fault_machine_hours" numeric(15, 4) NOT NULL,
	"fault_card_hours" numeric(15, 4) NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_fault_card_hours_daily" IS '日故障卡时；internal/external 各一行';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."stat_date" IS '业务日';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."sla_scope" IS '统计范围；默认 all';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."impact_side" IS '影响侧；internal / external';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."import_batch_id" IS '导入批次 ID；可选';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."fault_machine_hours" IS '故障台时';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."fault_card_hours" IS '故障卡时';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_fault_card_hours_daily"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_fault_card_hours_daily_stat_scope_side_uk"
	ON "sla_fault_card_hours_daily" USING btree ("stat_date", "data_center_id", "gpu_card_type_id", "sla_scope", "impact_side");

ALTER TABLE "sla_fault_card_hours_daily"
	ADD CONSTRAINT "sla_fault_card_hours_daily_import_batch_id_sla_import_batch_id_fk"
	FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id")
	ON DELETE set null ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_utilization_daily — 日利用与闲置
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_utilization_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"import_batch_id" text,
	"service_deploy_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"bare_metal_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"actual_usage_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_card_hours" numeric(15, 4) NOT NULL,
	"waste_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"internal_usage_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"idle_card_hours" numeric(15, 4) NOT NULL,
	"idle_rate" numeric(8, 6),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_utilization_daily" IS '日利用与闲置；粒度=机房×卡型×日';
COMMENT ON COLUMN "sla_utilization_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_utilization_daily"."stat_date" IS '业务日';
COMMENT ON COLUMN "sla_utilization_daily"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_utilization_daily"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_utilization_daily"."sla_scope" IS '统计范围；默认 all';
COMMENT ON COLUMN "sla_utilization_daily"."import_batch_id" IS '导入批次 ID；可选';
COMMENT ON COLUMN "sla_utilization_daily"."service_deploy_card_hours" IS '服务部署消耗卡时';
COMMENT ON COLUMN "sla_utilization_daily"."bare_metal_card_hours" IS '裸金属消耗卡时（开机摊销汇总）';
COMMENT ON COLUMN "sla_utilization_daily"."actual_usage_card_hours" IS '实际使用卡时合计；=部署+裸金属';
COMMENT ON COLUMN "sla_utilization_daily"."total_supply_card_hours" IS '总供给卡时；与 supply 表一致';
COMMENT ON COLUMN "sla_utilization_daily"."waste_card_hours" IS '浪费卡时；与 waste 表一致';
COMMENT ON COLUMN "sla_utilization_daily"."internal_usage_card_hours" IS '内部使用卡时；默认 0，中台 Job 可后补';
COMMENT ON COLUMN "sla_utilization_daily"."idle_card_hours" IS '闲置卡时；可导入或按恒等式计算';
COMMENT ON COLUMN "sla_utilization_daily"."idle_rate" IS '闲置率；idle / total_supply，可选';
COMMENT ON COLUMN "sla_utilization_daily"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_utilization_daily"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_utilization_daily"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_utilization_daily_stat_scope_uk"
	ON "sla_utilization_daily" USING btree ("stat_date", "data_center_id", "gpu_card_type_id", "sla_scope");

ALTER TABLE "sla_utilization_daily"
	ADD CONSTRAINT "sla_utilization_daily_import_batch_id_sla_import_batch_id_fk"
	FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id")
	ON DELETE set null ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_waste_daily — 日浪费
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_waste_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"import_batch_id" text,
	"waste_machine_hours" numeric(15, 4) NOT NULL,
	"waste_card_hours" numeric(15, 4) NOT NULL,
	"waste_rate" numeric(8, 6),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_waste_daily" IS '日浪费；粒度=机房×卡型×日';
COMMENT ON COLUMN "sla_waste_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_waste_daily"."stat_date" IS '业务日';
COMMENT ON COLUMN "sla_waste_daily"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_waste_daily"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_waste_daily"."sla_scope" IS '统计范围；默认 all';
COMMENT ON COLUMN "sla_waste_daily"."import_batch_id" IS '导入批次 ID；可选';
COMMENT ON COLUMN "sla_waste_daily"."waste_machine_hours" IS '浪费台时';
COMMENT ON COLUMN "sla_waste_daily"."waste_card_hours" IS '浪费卡时';
COMMENT ON COLUMN "sla_waste_daily"."waste_rate" IS '浪费率；waste / total_supply，可选';
COMMENT ON COLUMN "sla_waste_daily"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_waste_daily"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_waste_daily"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_waste_daily_stat_scope_uk"
	ON "sla_waste_daily" USING btree ("stat_date", "data_center_id", "gpu_card_type_id", "sla_scope");

ALTER TABLE "sla_waste_daily"
	ADD CONSTRAINT "sla_waste_daily_import_batch_id_sla_import_batch_id_fk"
	FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id")
	ON DELETE set null ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_onboarding_loss — 上架损耗（事件级）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_onboarding_loss" (
	"id" text PRIMARY KEY NOT NULL,
	"external_record_id" varchar(128) NOT NULL,
	"import_batch_id" text,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"device_count" integer NOT NULL,
	"gpu_count" integer NOT NULL,
	"ops_received_at" timestamp with time zone NOT NULL,
	"actual_shelved_at" timestamp with time zone NOT NULL,
	"loss_hours" numeric(15, 4) NOT NULL,
	"loss_card_hours" numeric(15, 4) NOT NULL,
	"supplier_device_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_onboarding_loss" IS '上架损耗；事件级，幂等键 external_record_id';
COMMENT ON COLUMN "sla_onboarding_loss"."id" IS '主键';
COMMENT ON COLUMN "sla_onboarding_loss"."external_record_id" IS '幂等键；OPS-ONB-{yyyyMMdd}-{seq}';
COMMENT ON COLUMN "sla_onboarding_loss"."import_batch_id" IS '导入批次 ID；可选';
COMMENT ON COLUMN "sla_onboarding_loss"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_onboarding_loss"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_onboarding_loss"."device_count" IS '设备台数';
COMMENT ON COLUMN "sla_onboarding_loss"."gpu_count" IS 'GPU 卡数';
COMMENT ON COLUMN "sla_onboarding_loss"."ops_received_at" IS '运维接收设备时间';
COMMENT ON COLUMN "sla_onboarding_loss"."actual_shelved_at" IS '实际上架时间';
COMMENT ON COLUMN "sla_onboarding_loss"."loss_hours" IS '损耗时长（小时）';
COMMENT ON COLUMN "sla_onboarding_loss"."loss_card_hours" IS '损耗卡时；loss_hours × gpu_count';
COMMENT ON COLUMN "sla_onboarding_loss"."supplier_device_ids" IS '关联物理机 ID 列表；jsonb 数组';
COMMENT ON COLUMN "sla_onboarding_loss"."raw_json" IS '原始报文（建议保留）';
COMMENT ON COLUMN "sla_onboarding_loss"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_onboarding_loss"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_onboarding_loss_external_record_id_uk"
	ON "sla_onboarding_loss" USING btree ("external_record_id");
CREATE INDEX "sla_onboarding_loss_dc_card_ops_received_at_idx"
	ON "sla_onboarding_loss" USING btree ("data_center_id", "gpu_card_type_id", "ops_received_at");

ALTER TABLE "sla_onboarding_loss"
	ADD CONSTRAINT "sla_onboarding_loss_import_batch_id_sla_import_batch_id_fk"
	FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id")
	ON DELETE set null ON UPDATE no action;


-- =============================================================================
-- 第二部分：CRM Job 下游表（运维勿写）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- sla_ops_fault_daily — 故障日快照（新增 / 遗留）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_ops_fault_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"list_kind" varchar(16) NOT NULL,
	"incident_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"snapshot_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_ops_fault_daily" IS '故障日快照；新增/遗留列表，CRM 日切 Job 写入';
COMMENT ON COLUMN "sla_ops_fault_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_ops_fault_daily"."stat_date" IS '业务日';
COMMENT ON COLUMN "sla_ops_fault_daily"."list_kind" IS '列表类型；new=新增 / carryover=遗留';
COMMENT ON COLUMN "sla_ops_fault_daily"."incident_id" IS '故障事件 ID；FK→sla_ops_fault_incident';
COMMENT ON COLUMN "sla_ops_fault_daily"."data_center_id" IS '机房 ID；冗余';
COMMENT ON COLUMN "sla_ops_fault_daily"."gpu_card_type_id" IS '卡型 ID；冗余';
COMMENT ON COLUMN "sla_ops_fault_daily"."snapshot_status" IS '当日结束时故障状态快照';
COMMENT ON COLUMN "sla_ops_fault_daily"."created_at" IS '创建时间';

CREATE UNIQUE INDEX "sla_ops_fault_daily_stat_list_incident_uk"
	ON "sla_ops_fault_daily" USING btree ("stat_date", "list_kind", "incident_id");
CREATE INDEX "sla_ops_fault_daily_stat_dc_card_list_kind_idx"
	ON "sla_ops_fault_daily" USING btree ("stat_date", "data_center_id", "gpu_card_type_id", "list_kind");

ALTER TABLE "sla_ops_fault_daily"
	ADD CONSTRAINT "sla_ops_fault_daily_incident_id_sla_ops_fault_incident_id_fk"
	FOREIGN KEY ("incident_id") REFERENCES "public"."sla_ops_fault_incident"("id")
	ON DELETE cascade ON UPDATE no action;

-- -----------------------------------------------------------------------------
-- sla_fault_count_daily — 故障次数日汇总
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_fault_count_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"new_fault_count" integer DEFAULT 0 NOT NULL,
	"carryover_fault_count" integer DEFAULT 0 NOT NULL,
	"closed_fault_count" integer DEFAULT 0 NOT NULL,
	"resolved_fault_count" integer DEFAULT 0 NOT NULL,
	"new_fault_device_count" integer DEFAULT 0 NOT NULL,
	"carryover_fault_device_count" integer DEFAULT 0 NOT NULL,
	"closed_fault_device_count" integer DEFAULT 0 NOT NULL,
	"new_fault_by_category" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_fault_count_daily" IS '故障次数日汇总；事件级+设备级，CRM Job 写入';
COMMENT ON COLUMN "sla_fault_count_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_fault_count_daily"."stat_date" IS '业务日';
COMMENT ON COLUMN "sla_fault_count_daily"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_fault_count_daily"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_fault_count_daily"."sla_scope" IS '统计范围；默认 all';
COMMENT ON COLUMN "sla_fault_count_daily"."new_fault_count" IS '当日新增故障事件数';
COMMENT ON COLUMN "sla_fault_count_daily"."carryover_fault_count" IS '日末遗留故障事件数';
COMMENT ON COLUMN "sla_fault_count_daily"."closed_fault_count" IS '当日关闭故障事件数';
COMMENT ON COLUMN "sla_fault_count_daily"."resolved_fault_count" IS '当日解决（含临时解决）事件数';
COMMENT ON COLUMN "sla_fault_count_daily"."new_fault_device_count" IS '当日新增故障涉及设备数（去重 SN）';
COMMENT ON COLUMN "sla_fault_count_daily"."carryover_fault_device_count" IS '日末遗留故障设备数';
COMMENT ON COLUMN "sla_fault_count_daily"."closed_fault_device_count" IS '当日关闭的设备故障数';
COMMENT ON COLUMN "sla_fault_count_daily"."new_fault_by_category" IS '按类别新增故障数；jsonb 如 {network:2}';
COMMENT ON COLUMN "sla_fault_count_daily"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_fault_count_daily"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_fault_count_daily_stat_scope_uk"
	ON "sla_fault_count_daily" USING btree ("stat_date", "data_center_id", "gpu_card_type_id", "sla_scope");


-- -----------------------------------------------------------------------------
-- sla_fault_device_daily — 设备×日故障 rollup（P0，CRM Job 写入）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_fault_device_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"supplier_device_id" text,
	"device_sn" varchar(64) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"impact_side" varchar(16) NOT NULL,
	"fault_machine_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"fault_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"eligible_machine_hours" numeric(15, 4) DEFAULT 24 NOT NULL,
	"eligible_card_hours" numeric(15, 4) NOT NULL,
	"device_availability_rate" numeric(8, 6),
	"incident_count" integer DEFAULT 0 NOT NULL,
	"source_incident_device_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rollup_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_fault_device_daily" IS '设备×日故障 rollup；P0 单设备 SLA，CRM Job 自 incident_device 裁剪写入';
COMMENT ON COLUMN "sla_fault_device_daily"."id" IS '主键';
COMMENT ON COLUMN "sla_fault_device_daily"."stat_date" IS '业务日';
COMMENT ON COLUMN "sla_fault_device_daily"."supplier_device_id" IS '物理机 ID；FK→supplier_device，SN 未匹配可空';
COMMENT ON COLUMN "sla_fault_device_daily"."device_sn" IS '设备 SN；UK 组成部分';
COMMENT ON COLUMN "sla_fault_device_daily"."data_center_id" IS '机房 ID；冗余';
COMMENT ON COLUMN "sla_fault_device_daily"."gpu_card_type_id" IS '卡型 ID；冗余';
COMMENT ON COLUMN "sla_fault_device_daily"."gpu_count" IS '设备 GPU 卡数';
COMMENT ON COLUMN "sla_fault_device_daily"."impact_side" IS '影响侧；internal / external';
COMMENT ON COLUMN "sla_fault_device_daily"."fault_machine_hours" IS '当日裁剪后故障台时合计';
COMMENT ON COLUMN "sla_fault_device_daily"."fault_card_hours" IS '当日裁剪后故障卡时合计';
COMMENT ON COLUMN "sla_fault_device_daily"."eligible_machine_hours" IS '可计 SLA 台时；P0 固定 24';
COMMENT ON COLUMN "sla_fault_device_daily"."eligible_card_hours" IS '可计 SLA 卡时；P0 = gpu_count × 24';
COMMENT ON COLUMN "sla_fault_device_daily"."device_availability_rate" IS '单设备日可用率；仅 external 行写入，见 §8.8';
COMMENT ON COLUMN "sla_fault_device_daily"."incident_count" IS '当日涉及该 SN 的故障事件数';
COMMENT ON COLUMN "sla_fault_device_daily"."source_incident_device_ids" IS '来源设备明细 ID 列表；追溯用';
COMMENT ON COLUMN "sla_fault_device_daily"."rollup_at" IS 'Job 汇总写入时间';
COMMENT ON COLUMN "sla_fault_device_daily"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_fault_device_daily"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_fault_device_daily_stat_sn_side_uk"
	ON "sla_fault_device_daily" USING btree ("stat_date", "device_sn", "impact_side");
CREATE INDEX "sla_fault_device_daily_supplier_device_stat_date_idx"
	ON "sla_fault_device_daily" USING btree ("supplier_device_id", "stat_date");
CREATE INDEX "sla_fault_device_daily_dc_card_stat_date_idx"
	ON "sla_fault_device_daily" USING btree ("data_center_id", "gpu_card_type_id", "stat_date");


-- -----------------------------------------------------------------------------
-- sla_device_monthly — 设备×月 SLA 读模型（P0，CRM Job 写入）
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_device_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_month" varchar(7) NOT NULL,
	"supplier_device_id" text,
	"device_sn" varchar(64) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"active_days" integer DEFAULT 0 NOT NULL,
	"external_fault_machine_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"internal_fault_machine_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"external_fault_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"internal_fault_card_hours" numeric(15, 4) DEFAULT 0 NOT NULL,
	"eligible_machine_hours" numeric(15, 4) NOT NULL,
	"eligible_card_hours" numeric(15, 4) NOT NULL,
	"device_availability_rate" numeric(8, 6),
	"sla_met" boolean,
	"rollup_status" varchar(32) NOT NULL,
	"rollup_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_device_monthly" IS '设备×月 SLA 读模型；P0 单设备故障可用率，CRM Job 写入';
COMMENT ON COLUMN "sla_device_monthly"."id" IS '主键';
COMMENT ON COLUMN "sla_device_monthly"."sla_month" IS '自然月；格式 YYYY-MM';
COMMENT ON COLUMN "sla_device_monthly"."supplier_device_id" IS '物理机 ID；FK→supplier_device，可选';
COMMENT ON COLUMN "sla_device_monthly"."device_sn" IS '设备 SN；UK 组成部分';
COMMENT ON COLUMN "sla_device_monthly"."data_center_id" IS '机房 ID';
COMMENT ON COLUMN "sla_device_monthly"."gpu_card_type_id" IS '卡型 ID';
COMMENT ON COLUMN "sla_device_monthly"."gpu_count" IS '设备 GPU 卡数';
COMMENT ON COLUMN "sla_device_monthly"."active_days" IS '月内活跃天数（与故障时段有交集）';
COMMENT ON COLUMN "sla_device_monthly"."external_fault_machine_hours" IS '月内外部故障台时合计';
COMMENT ON COLUMN "sla_device_monthly"."internal_fault_machine_hours" IS '月内内部故障台时合计';
COMMENT ON COLUMN "sla_device_monthly"."external_fault_card_hours" IS '月内外部故障卡时合计';
COMMENT ON COLUMN "sla_device_monthly"."internal_fault_card_hours" IS '月内内部故障卡时合计';
COMMENT ON COLUMN "sla_device_monthly"."eligible_machine_hours" IS '月内可计 SLA 台时合计';
COMMENT ON COLUMN "sla_device_monthly"."eligible_card_hours" IS '月内可计 SLA 卡时合计';
COMMENT ON COLUMN "sla_device_monthly"."device_availability_rate" IS '单设备月故障可用率；见 §8.8';
COMMENT ON COLUMN "sla_device_monthly"."sla_met" IS '是否 SLA 达标；阈值 P2 配置';
COMMENT ON COLUMN "sla_device_monthly"."rollup_status" IS '汇总状态；pending/complete/partial';
COMMENT ON COLUMN "sla_device_monthly"."rollup_at" IS 'Job 汇总时间';
COMMENT ON COLUMN "sla_device_monthly"."metadata" IS '扩展元数据；对账差异、缺失天等';
COMMENT ON COLUMN "sla_device_monthly"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_device_monthly"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_device_monthly_month_sn_uk"
	ON "sla_device_monthly" USING btree ("sla_month", "device_sn");
CREATE INDEX "sla_device_monthly_supplier_device_month_idx"
	ON "sla_device_monthly" USING btree ("supplier_device_id", "sla_month");
CREATE INDEX "sla_device_monthly_dc_card_month_idx"
	ON "sla_device_monthly" USING btree ("data_center_id", "gpu_card_type_id", "sla_month");


-- -----------------------------------------------------------------------------
-- sla_datacenter_card_type_monthly — 机房×卡型×月 SLA 汇总
-- -----------------------------------------------------------------------------
CREATE TABLE "sla_datacenter_card_type_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_month" varchar(7) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"supplier_id" text,
	"contract_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_machine_hours" numeric(15, 4) NOT NULL,
	"onboarding_loss_card_hours" numeric(15, 4) NOT NULL,
	"new_fault_count" integer NOT NULL,
	"carryover_fault_count_end" integer NOT NULL,
	"closed_fault_count" integer NOT NULL,
	"new_fault_device_count" integer NOT NULL,
	"carryover_fault_device_count_end" integer NOT NULL,
	"external_fault_card_hours" numeric(15, 4) NOT NULL,
	"internal_fault_card_hours" numeric(15, 4) NOT NULL,
	"actual_usage_card_hours" numeric(15, 4) NOT NULL,
	"idle_card_hours" numeric(15, 4) NOT NULL,
	"idle_rate_avg" numeric(8, 6),
	"waste_card_hours" numeric(15, 4) NOT NULL,
	"waste_rate_avg" numeric(8, 6),
	"internal_usage_card_hours" numeric(15, 4) NOT NULL,
	"onboarding_loss_event_count" integer NOT NULL,
	"platform_offline_incident_count" integer NOT NULL,
	"platform_online_incident_count" integer NOT NULL,
	"compensation_amount_total" numeric(15, 4) NOT NULL,
	"exempt_incident_count" integer NOT NULL,
	"availability_rate" numeric(8, 6),
	"sla_met" boolean,
	"rollup_status" varchar(32) NOT NULL,
	"rollup_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "sla_datacenter_card_type_monthly" IS '机房×卡型×月 SLA 汇总；CRM 月切 Job 写入';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."id" IS '主键';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."sla_month" IS '自然月；YYYY-MM';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."data_center_id" IS '机房 ID；FK→data_center';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."gpu_card_type_id" IS '卡型 ID；FK→gpu_card_type';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."sla_scope" IS '统计范围；默认 all';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."supplier_id" IS '供应商 ID；冗余自机房';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."contract_card_hours" IS '月总合同卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."total_supply_card_hours" IS '月总供给卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."total_supply_machine_hours" IS '月总供给台时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."onboarding_loss_card_hours" IS '月上架损耗卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."new_fault_count" IS '月新增故障事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."carryover_fault_count_end" IS '月末遗留故障事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."closed_fault_count" IS '月内关闭故障事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."new_fault_device_count" IS '月新增故障设备数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."carryover_fault_device_count_end" IS '月末遗留故障设备数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."external_fault_card_hours" IS '月外部故障卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."internal_fault_card_hours" IS '月内部故障卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."actual_usage_card_hours" IS '月实际使用卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."idle_card_hours" IS '月闲置卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."idle_rate_avg" IS '月平均闲置率';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."waste_card_hours" IS '月浪费卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."waste_rate_avg" IS '月平均浪费率';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."internal_usage_card_hours" IS '月内部使用卡时';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."onboarding_loss_event_count" IS '月上架损耗事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."platform_offline_incident_count" IS '月线下裸金属故障事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."platform_online_incident_count" IS '月线上故障事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."compensation_amount_total" IS '月赔付金额合计';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."exempt_incident_count" IS '月免责例外事件数';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."availability_rate" IS '机房×卡型供给可用率；见 §8.1（非设备 SLA）';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."sla_met" IS '是否 SLA 达标';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."rollup_status" IS '汇总状态';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."rollup_at" IS 'Job 汇总时间';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."metadata" IS '扩展元数据';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."created_at" IS '创建时间';
COMMENT ON COLUMN "sla_datacenter_card_type_monthly"."updated_at" IS '更新时间';

CREATE UNIQUE INDEX "sla_datacenter_card_type_monthly_month_scope_uk"
	ON "sla_datacenter_card_type_monthly" USING btree ("sla_month", "data_center_id", "gpu_card_type_id", "sla_scope");

-- =============================================================================
-- 附录：供应域/CRM 外键（勿在本脚本中直接执行；Drizzle migration 中追加）
-- =============================================================================
-- 前置表须已存在：user_staff, supplier, data_center, gpu_card_type,
--                 supplier_device, bare_metal_order, bare_metal_order_device
--
-- ALTER TABLE "sla_import_batch"
-- 	ADD CONSTRAINT "sla_import_batch_created_by_staff_id_user_staff_id_fk"
-- 	FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id")
-- 	ON DELETE set null ON UPDATE no action;
--
-- ALTER TABLE "sla_ops_fault_incident"
-- 	ADD CONSTRAINT "sla_ops_fault_incident_supplier_id_supplier_id_fk"
-- 	FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id")
-- 	ON DELETE restrict ON UPDATE no action;
-- ...（其余外键见设计文档 sla-ops-direct-db-write-design.md §5.13 历史 DDL）
