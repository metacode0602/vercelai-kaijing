/**
 * 统一算力资源域表结构（Drizzle ORM / PostgreSQL）
 *
 * 设计依据：container-cloud-instance-implementation.md、
 *   serverless-implementation.md、product-line-taxonomy.md
 *
 * 约定：
 * - 主键 text (cuid2)；金额 numeric(15,4)
 * - compute_base 为所有算力产品（Cloud VM / Serverless / Bare Metal）的统一基础表
 * - cloud_vm_detail / serverless_detail 为扩展表，与 compute_base 1:1
 * - 聚合字段不入库
 */

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import { billingTenant, userStaff } from "./crm-schema"
import { dataCenter } from "./supply-schema"
import { merchant } from "./merchant-schema"

const money = (n: string) => numeric(n, { precision: 15, scale: 4 })
const ts = (n: string) => timestamp(n, { withTimezone: true }).defaultNow().notNull()

// ---------------------------------------------------------------------------
// §1 算力任务基础表（Cloud VM / Serverless 统一基础）
// ---------------------------------------------------------------------------

/**
 * 算力任务基础表
 *
 * 每条记录代表一个用户创建的算力实例（Cloud VM 或 Serverless）。
 * Bare Metal 使用独立的 bare_metal_order 表，不在此表中。
 *
 * product_line: serverless | cloud_vm (参考 product-line-taxonomy.md)
 * billing_mode: postpaid | prepaid | spot (spot 仅限 product_line=job，此处不使用)
 * commitment:   on_demand | monthly | yearly
 * status:       creating | running | stopped | error | releasing | released
 */
export const computeBase = pgTable(
  "compute_base",
  {
    id: text("id").primaryKey(),
    organizationId: varchar("organization_id", { length: 64 }).notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    /** serverless | cloud_vm */
    productLine: varchar("product_line", { length: 32 }).notNull(),
    /** postpaid | prepaid */
    billingMode: varchar("billing_mode", { length: 32 }).notNull(),
    /** on_demand | monthly | yearly */
    commitment: varchar("commitment", { length: 32 }).notNull().default("on_demand"),
    /** 用户自定义实例名称 */
    name: varchar("name", { length: 255 }),
    /** creating | running | stopped | error | releasing | released */
    status: varchar("status", { length: 32 }).notNull().default("creating"),
    /** 区域/机房信息 */
    region: varchar("region", { length: 128 }),
    idcName: varchar("idc_name", { length: 128 }),
    /** 资源规格 JSON（gpu_count, cpu_count, memory_gb 等） */
    resourceSpec: jsonb("resource_spec").notNull().default({}),
    /** 镜像信息 */
    image: varchar("image", { length: 512 }),
    /** 关联支付订单 */
    paymentOrderId: text("payment_order_id"),
    /** 订单金额快照 */
    orderAmount: money("order_amount"),
    /** 余额抵扣金额 */
    balanceAmount: money("balance_amount").notNull().default("0"),
    /** 券抵扣金额 */
    couponAmount: money("coupon_amount").notNull().default("0"),
    /** 到期时间 */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** 扩展配置 JSON */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("compute_base_org_idx").on(table.organizationId),
    index("compute_base_tenant_idx").on(table.tenantId),
    index("compute_base_product_line_idx").on(table.productLine),
    index("compute_base_status_idx").on(table.status),
    index("compute_base_org_product_status_idx").on(
      table.organizationId,
      table.productLine,
      table.status,
    ),
  ],
)

// ---------------------------------------------------------------------------
// §2 Cloud VM 扩展表
// ---------------------------------------------------------------------------

/**
 * Cloud VM 扩展详情（1:1 关联 compute_base）
 *
 * os_type: linux | windows
 */
export const cloudVmDetail = pgTable(
  "cloud_vm_detail",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    /** linux | windows */
    osType: varchar("os_type", { length: 16 }).notNull().default("linux"),
    /** 操作系统版本 */
    osVersion: varchar("os_version", { length: 128 }),
    /** 网络配置 JSON */
    networkConfig: jsonb("network_config").notNull().default({}),
    /** 存储配置 JSON */
    storageConfig: jsonb("storage_config").notNull().default({}),
    /** 安全组规则 JSON */
    securityGroupRules: jsonb("security_group_rules").notNull().default([]),
    /** SSH 公钥 */
    sshPublicKey: text("ssh_public_key"),
    /** 内网 IP */
    internalIp: varchar("internal_ip", { length: 45 }),
    /** 公网 IP */
    publicIp: varchar("public_ip", { length: 45 }),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("cloud_vm_detail_base_idx").on(table.computeBaseId),
  ],
)

// ---------------------------------------------------------------------------
// §3 Serverless 扩展表
// ---------------------------------------------------------------------------

/**
 * Serverless 扩展详情（1:1 关联 compute_base）
 *
 * fault_tolerance: interruptible | non_interruptible
 *   对应 serverless-implementation.md §2 可中断调度
 */
export const serverlessDetail = pgTable(
  "serverless_detail",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    /** 服务名称（SkyPilot serve name） */
    serviceName: varchar("service_name", { length: 255 }),
    /** interruptible | non_interruptible (参考 serverless-implementation.md) */
    faultTolerance: varchar("fault_tolerance", { length: 32 }).notNull().default("non_interruptible"),
    /** 最小副本数 */
    minReplicas: integer("min_replicas").notNull().default(1),
    /** 最大副本数 */
    maxReplicas: integer("max_replicas").notNull().default(1),
    /** 目标端口 */
    targetPort: integer("target_port"),
    /** 容器启动命令 */
    command: text("command"),
    /** 环境变量 JSON */
    envVars: jsonb("env_vars").notNull().default({}),
    /** 公网访问 URL（sticky，不随区域迁移变化） */
    publicUrl: varchar("public_url", { length: 512 }),
    /** 内网端点 */
    internalEndpoint: varchar("internal_endpoint", { length: 512 }),
    /** 服务端点 URL */
    endpointUrl: varchar("endpoint_url", { length: 512 }),
    /** SkyPilot serve ID (legacy path only; never store waverless IDs here) */
    skyServeId: varchar("sky_serve_id", { length: 256 }),
    /**
     * Orchestrator backend discriminator (immutable after create).
     * skypilot = legacy SkyServe path; waverless = Gongji/CN control plane.
     */
    orchestratorType: varchar("orchestrator_type", { length: 32 })
      .notNull()
      .default("skypilot"),
    /** Waverless external endpoint ID (= compute_base.id for new creates) */
    waverlessEndpointId: varchar("waverless_endpoint_id", { length: 256 }),
    /** Platform logical AZ ID (tenant-facing region); not vendor physical region */
    logicalAzId: varchar("logical_az_id", { length: 128 }),
    /** Bound provider id, e.g. gongji (platform-managed credentials) */
    providerId: varchar("provider_id", { length: 64 }),
    /** M1 placement: auto (default) | pin — see §10.19 */
    placementMode: varchar("placement_mode", { length: 32 })
      .notNull()
      .default("auto"),
    /** Logical region allowlist; empty JSON array = no restriction */
    regionAllowlist: jsonb("region_allowlist").notNull().default([]),
    /** Wait-age scale-up threshold seconds; 0 disables wait-age trigger */
    scaleUpWaitSeconds: integer("scale_up_wait_seconds").notNull().default(0),
    /** Desired generation for reconcile with waverless runtime */
    desiredGeneration: integer("desired_generation").notNull().default(0),
    /** Last known provider/runtime status from waverless sync */
    providerStatus: varchar("provider_status", { length: 64 }),
    /** Last successful runtime sync from waverless */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("serverless_detail_base_idx").on(table.computeBaseId),
    index("serverless_detail_orchestrator_idx").on(table.orchestratorType),
    index("serverless_detail_waverless_ep_idx").on(table.waverlessEndpointId),
  ],
)

// ---------------------------------------------------------------------------
// §4 算力任务事件时间线
// ---------------------------------------------------------------------------

/**
 * 算力任务事件（不可变审计日志）
 *
 * event_type: created | deploying | running | stopped | error | released | renewed | migrated
 */
export const computeTaskEvent = pgTable(
  "compute_task_event",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    /** 事件类型 */
    eventType: varchar("event_type", { length: 32 }).notNull(),
    /** 事件前状态 */
    previousStatus: varchar("previous_status", { length: 32 }),
    /** 事件后状态 */
    newStatus: varchar("new_status", { length: 32 }),
    /** 事件描述 */
    description: text("description"),
    /** 事件详情 JSON */
    detail: jsonb("detail"),
    /** 触发人 */
    triggeredBy: varchar("triggered_by", { length: 64 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("compute_task_event_base_idx").on(table.computeBaseId),
    index("compute_task_event_base_occurred_idx").on(table.computeBaseId, table.occurredAt),
    index("compute_task_event_type_idx").on(table.eventType),
  ],
)



// ---------------------------------------------------------------------------
// §5 自定义镜像（租户 Docker 镜像元数据）
// ---------------------------------------------------------------------------

/**
 * 自定义镜像
 *
 * 存储租户 push / 保存 / 导入到 Harbor 的镜像元数据。
 * 实际镜像数据存储在 Harbor，此表仅记录元信息和状态。
 */
export const customImage = pgTable(
  "custom_image",
  {
    id: text("id").primaryKey(),
    /** 租户 ID（= organization.id） */
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    /** 镜像标签名（用户自定义） */
    tagName: varchar("tag_name", { length: 255 }).notNull(),
    /** 完整镜像引用：registry.gongji.cloud/tenant-{id}/{tag} */
    imageRef: varchar("image_ref", { length: 512 }).notNull(),
    /** 镜像 digest (sha256:...) */
    digest: varchar("digest", { length: 256 }),
    /** 镜像大小（字节） */
    sizeBytes: integer("size_bytes"),
    /** 来源：push | commit | external */
    source: varchar("source", { length: 32 }).notNull(),
    /** commit 来源的实例 ID（source=commit 时） */
    sourceTaskId: text("source_task_id"),
    /** 外部仓库原始引用（source=external 时） */
    externalRef: varchar("external_ref", { length: 1024 }),
    /** 状态：pending | scanning | ready | failed */
    status: varchar("status", { length: 16 }).notNull().default("ready"),
    /** 扫描状态：clean | vulnerability_found | scanning | pending */
    scanStatus: varchar("scan_status", { length: 32 }),
    /** Trivy 扫描结果摘要 */
    scanSummary: jsonb("scan_summary"),
    /** 描述 */
    description: text("description"),
    /** 固定不自动清理 */
    isPinned: boolean("is_pinned").notNull().default(false),
    /** 推荐部署配置 (从实例保存时自动提取) */
    recommendedConfig: jsonb("recommended_config").notNull().default({}),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("custom_image_tenant_idx").on(table.tenantId),
    index("custom_image_tenant_status_idx").on(table.tenantId, table.status),
  ],
)

// ---------------------------------------------------------------------------
// §6 镜像保存任务（docker commit + push 追踪）
// ---------------------------------------------------------------------------

/**
 * 镜像保存任务
 *
 * 记录从运行中实例保存镜像的异步任务状态。
 */
export const imageSaveJob = pgTable(
  "image_save_job",
  {
    id: text("id").primaryKey(),
    /** 租户 ID */
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    /** 来源实例 ID */
    sourceTaskId: text("source_task_id").notNull(),
    /** 镜像标签名 */
    tagName: varchar("tag_name", { length: 255 }).notNull(),
    /** 完整镜像引用 */
    imageRef: varchar("image_ref", { length: 512 }).notNull(),
    /** 状态：committing | pushing | completed | failed */
    status: varchar("status", { length: 16 }).notNull().default("committing"),
    /** 镜像 digest */
    digest: varchar("digest", { length: 256 }),
    /** 镜像大小（字节） */
    sizeBytes: integer("size_bytes"),
    /** 执行 commit 的节点 */
    nodeId: varchar("node_id", { length: 255 }),
    /** 错误信息 */
    errorMessage: text("error_message"),
    createdAt: ts("created_at"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("image_save_job_tenant_idx").on(table.tenantId),
    index("image_save_job_status_idx").on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// §7 仓库凭证（加密存储）
// ---------------------------------------------------------------------------

/**
 * 仓库凭证
 *
 * 存储租户用于 push/pull 镜像的仓库登录凭证。
 * 平台凭证由系统自动生成（Harbor Robot Account 或本地用户）。
 * 外部凭证由租户手动配置。
 */
export const registryCredential = pgTable(
  "registry_credential",
  {
    id: text("id").primaryKey(),
    /** 租户 ID */
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    /** 仓库地址（registry.gongji.cloud 或外部地址） */
    registryHost: varchar("registry_host", { length: 512 }).notNull(),
    /** 用户名 */
    username: varchar("username", { length: 255 }).notNull(),
    /** 密码（加密存储） */
    passwordEnc: text("password_enc").notNull(),
    /** 凭证类型：platform | external */
    credentialType: varchar("credential_type", { length: 16 }).notNull(),
    /** 用途范围：push_pull | pull_only */
    scope: varchar("scope", { length: 32 }).notNull().default("push_pull"),
    /** 最后使用时间 */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** 过期时间 */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("registry_credential_tenant_idx").on(table.tenantId),
  ],
)

// ---------------------------------------------------------------------------
// §8 基础镜像
// ---------------------------------------------------------------------------

/**
 * 基础镜像
 *
 * 平台官方维护的 GPU 运行时镜像目录（PyTorch、TF、Ubuntu+CUDA 等）。
 */
export const baseImage = pgTable(
  "base_image",
  {
    id: text("id").primaryKey(),
    /** 镜像名称 e.g. pytorch/pytorch */
    name: varchar("name", { length: 255 }).notNull(),
    /** 展示名称 e.g. "PyTorch" */
    displayName: varchar("display_name", { length: 128 }).notNull(),
    /** 简要描述 */
    description: text("description"),
    /** 分类: framework / os / tool */
    category: varchar("category", { length: 64 }).notNull(),
    /** 标签 */
    tags: text("tags").array().notNull().default([]),
    iconUrl: varchar("icon_url", { length: 512 }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** 推荐部署配置 (命令/端口/环境变量/GPU) */
    recommendedConfig: jsonb("recommended_config").notNull().default({}),
    /** active | deprecated | removed */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("base_image_category_idx").on(table.category),
    index("base_image_status_idx").on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// §9 基础镜像版本
// ---------------------------------------------------------------------------

/**
 * 基础镜像版本
 *
 * 每个基础镜像可包含多个版本标签。
 */
export const baseImageVersion = pgTable(
  "base_image_version",
  {
    id: text("id").primaryKey(),
    /** 所属基础镜像 */
    baseImageId: text("base_image_id")
      .notNull()
      .references(() => baseImage.id, { onDelete: "cascade" }),
    /** 版本标签 e.g. 2.4.0-cuda12.4-cudnn9-runtime */
    versionTag: varchar("version_tag", { length: 255 }).notNull(),
    /** 展示标签（含日期） */
    displayLabel: varchar("display_label", { length: 255 }).notNull(),
    /** 完整镜像引用 docker.io/pytorch/pytorch:2.4.0-... */
    fullImageRef: varchar("full_image_ref", { length: 512 }).notNull(),
    /** CUDA 版本 */
    cudaVersion: varchar("cuda_version", { length: 32 }),
    /** OS 版本 */
    osVersion: varchar("os_version", { length: 64 }),
    /** Python 版本 */
    pythonVersion: varchar("python_version", { length: 32 }),
    /** 镜像大小（字节） */
    sizeBytes: integer("size_bytes"),
    /** 镜像摘要 sha256:... */
    digestSha256: varchar("digest_sha256", { length: 128 }),
    requiresGPU: boolean("requires_gpu").notNull().default(true),
    /** 最低显存要求 (MB) */
    minGpuMemory: integer("min_gpu_memory"),
    /** 是否最新推荐 */
    isLatest: boolean("is_latest").notNull().default(false),
    releaseDate: date("release_date"),
    deprecationDate: date("deprecation_date"),
    deprecationMessage: text("deprecation_message"),
    /** active | deprecated | removed */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("base_image_version_image_id_idx").on(table.baseImageId),
  ],
)

// ---------------------------------------------------------------------------
// §10 应用模板（应用商店）
// ---------------------------------------------------------------------------

/**
 * 应用模板
 *
 * 预配置 GPU/镜像/命令/端口的"一键部署"模板，用于应用商店。
 */
export const applicationTemplate = pgTable(
  "application_template",
  {
    id: text("id").primaryKey(),
    /** 模板名称 */
    name: varchar("name", { length: 255 }).notNull(),
    /** 描述 */
    description: text("description"),
    /** 分类: llm / image / audio / video / dev */
    category: varchar("category", { length: 32 }).notNull(),
    /** 标签 */
    tags: text("tags").array().notNull().default([]),
    /** 图标 */
    iconUrl: varchar("icon_url", { length: 512 }),
    /** 使用的镜像 */
    imageRef: varchar("image_ref", { length: 512 }).notNull(),
    /** 镜像来源: base_image | custom_image | docker_hub */
    sourceType: varchar("source_type", { length: 32 }).notNull().default("docker_hub"),
    /** 最低 GPU 推荐 */
    minGPU: varchar("min_gpu", { length: 64 }),
    /** 最少 GPU 数量 */
    minGPUCount: integer("min_gpu_count").default(1),
    /** 最低内存 (GB) */
    minMemoryGB: integer("min_memory_gb"),
    /** 最低系统盘 (GB) */
    minDiskGB: integer("min_disk_gb").default(60),
    /** 默认端口 */
    defaultPort: integer("default_port").default(8080),
    /** 推荐启动命令 */
    defaultCommand: text("default_command"),
    /** 推荐环境变量 */
    defaultEnvVars: jsonb("default_env_vars"),
    /** 健康检查路径 */
    healthCheckPath: varchar("health_check_path", { length: 256 }),
    /** 部署文档 */
    docsUrl: varchar("docs_url", { length: 1024 }),
    /** 源码地址 */
    sourceUrl: varchar("source_url", { length: 1024 }),
    /** instance | serverless */
    deployType: varchar("deploy_type", { length: 16 }).notNull().default("instance"),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    downloadCount: integer("download_count").notNull().default(0),
    /** pending | approved | rejected */
    reviewStatus: varchar("review_status", { length: 16 }).notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => userStaff.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** official | verified | community */
    tier: varchar("tier", { length: 16 }).notNull().default("community"),
    /** active | deprecated | removed */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdBy: text("created_by").references(() => userStaff.id, { onDelete: "set null" }),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("application_template_category_idx").on(table.category),
    index("application_template_review_idx").on(table.reviewStatus),
  ],
)

// ---------------------------------------------------------------------------
// §11 应用模板版本
// ---------------------------------------------------------------------------

/**
 * 应用模板版本
 *
 * 每个应用模板可包含多个版本，支持版本回退。
 */
export const applicationTemplateVersion = pgTable(
  "application_template_version",
  {
    id: text("id").primaryKey(),
    /** 所属模板 */
    templateId: text("template_id")
      .notNull()
      .references(() => applicationTemplate.id, { onDelete: "cascade" }),
    /** 版本号 e.g. v1.2.0 */
    versionTag: varchar("version_tag", { length: 64 }).notNull(),
    /** 变更日志 */
    changelog: text("changelog"),
    /** 该版本的镜像 */
    imageRef: varchar("image_ref", { length: 512 }).notNull(),
    /** 推荐 GPU 配置 */
    gpuRecommendations: jsonb("gpu_recommendations"),
    /** 启动命令 */
    command: text("command"),
    /** 环境变量 */
    envVars: jsonb("env_vars"),
    isLatest: boolean("is_latest").notNull().default(false),
    /** active | deprecated */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("application_template_version_template_idx").on(table.templateId),
  ],
)

// ---------------------------------------------------------------------------
// §12 预加载任务
// ---------------------------------------------------------------------------

/**
 * 预加载任务
 *
 * 在指定区域的节点上提前拉取镜像，加速首次启动。
 */
export const preloadTask = pgTable(
  "preload_task",
  {
    id: text("id").primaryKey(),
    /** 发起者（租户 ID） */
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    /** 要预加载的镜像 */
    imageRef: varchar("image_ref", { length: 512 }).notNull(),
    /** 完整镜像引用（含 digest） */
    fullImageRef: varchar("full_image_ref", { length: 512 }).notNull(),
    /** 镜像摘要 */
    imageDigest: varchar("image_digest", { length: 128 }),
    registryCredentialId: text("registry_credential_id")
      .references(() => registryCredential.id, { onDelete: "set null" }),
    /** 目标区域 */
    regionId: text("region_id")
      .notNull()
      .references(() => dataCenter.id, { onDelete: "restrict" }),
    /** pending | downloading | ready | failed */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** 下载进度 0-100 */
    progress: integer("progress").notNull().default(0),
    /** 镜像大小（字节） */
    sizeBytes: integer("size_bytes"),
    downloadedBytes: integer("downloaded_bytes").notNull().default(0),
    errorMessage: text("error_message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("preload_task_tenant_idx").on(table.tenantId),
    index("preload_task_region_idx").on(table.regionId),
    index("preload_task_status_idx").on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// §13 预加载节点任务（多节点并行）
// ---------------------------------------------------------------------------

/**
 * 预加载节点任务
 *
 * 每个预加载任务在多个节点上并行执行。
 */
export const preloadNodeTask = pgTable(
  "preload_node_task",
  {
    id: text("id").primaryKey(),
    /** 所属预加载任务 */
    preloadTaskId: text("preload_task_id")
      .notNull()
      .references(() => preloadTask.id, { onDelete: "cascade" }),
    /** 目标节点 */
    nodeName: varchar("node_name", { length: 256 }).notNull(),
    /** 节点 IP */
    nodeIp: varchar("node_ip", { length: 45 }),
    /** pending | downloading | ready | failed */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    progress: integer("progress").notNull().default(0),
    /** 拉取后的 digest */
    digestAfter: varchar("digest_after", { length: 128 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("preload_node_task_preload_idx").on(table.preloadTaskId),
  ],
)

// ---------------------------------------------------------------------------
// §14 API任务表（供OEM品牌站通过 apps/api 调用）
// ---------------------------------------------------------------------------

/**
 * API 任务表 (Q7=A / Q16=A)
 *
 * 供 OEM 品牌站通过 apps/api 创建/管理的任务。
 * 与 compute_base 独立，避免与官方 gpus 的 SkyPilot 直连路径冲突。
 */
export const apiTask = pgTable(
  "api_task",
  {
    id: text("id").primaryKey(),
    /** 所属商户 */
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "restrict" }),
    /** 所属租户 */
    tenantId: text("tenant_id")
      .notNull()
      .references(() => billingTenant.id, { onDelete: "restrict" }),
    /** 任务名称 */
    name: varchar("name", { length: 255 }).notNull(),
    /** job | serverless | vm | spot */
    type: varchar("type", { length: 32 }).notNull(),
    /** pending | running | completed | failed | cancelled */
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    /** GPU 卡型 */
    gpuCardType: varchar("gpu_card_type", { length: 128 }),
    /** GPU 数量 */
    gpuCount: integer("gpu_count"),
    /** 镜像 ID */
    imageId: varchar("image_id", { length: 256 }),
    /** 执行命令 */
    command: text("command"),
    /** 任务配置 JSON */
    config: jsonb("config").notNull().default({}),
    /** 后端任务 ID（SkyPilot / Kubernetes 等） */
    backendTaskId: varchar("backend_task_id", { length: 256 }),
    /** 进度 (0-100) */
    progress: integer("progress").notNull().default(0),
    /** 状态消息 */
    message: text("message"),
    /** 错误信息 */
    errorMessage: text("error_message"),
    /** 任务开始时间 */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** 任务完成时间 */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("api_task_merchant_idx").on(table.merchantId),
    index("api_task_tenant_idx").on(table.tenantId),
    index("api_task_status_idx").on(table.status),
    index("api_task_merchant_tenant_idx").on(table.merchantId, table.tenantId),
  ],
)
