/**
 * 裸金属设备种子数据初始化脚本
 *
 * 生成与 apps/gpus 模块 mock 数据完全一致的展示效果。
 * 包含：供应商、数据中心、GPU 卡型、物理设备、定价。
 *
 * 用法：
 *   DATABASE_URL=postgresql://... npx tsx packages/db/src/scripts/seed-metal-devices.ts
 *
 * 幂等性：使用 ON CONFLICT DO NOTHING，可重复执行。
 */

import { createId } from "@paralleldrive/cuid2"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import {
  supplier,
  dataCenter,
  gpuCardType,
  supplierDevice,
  supplierCardListPrice,
  customer,
  billingTenant,
  computeBase,
  cloudVmDetail,
  serverlessDetail,
} from "../schema"

// =============================================================================
// Mock 数据（与 apps/gpus/src/lib/metal-market-data.ts 保持一致）
// =============================================================================

interface MockDeviceSeed {
  id: string
  gpuModelKey: string
  displayName: string
  region: string
  networkMode: string
  gpuCount: number
  vcpu: number
  memoryGb: number
  systemDiskGb: number
  dataDiskGb: number
  pricing: { hourly: number; daily: number; weekly: number; monthly: number }
  stock: number
  availableUntil: string
  availableHours: number
}

const MOCK_DEVICE_SEEDS: MockDeviceSeed[] = [
  {
    id: "metal-4090-8x-nvlink-jiangsu2",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "江苏2区",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 2000,
    pricing: { hourly: 12.8, daily: 280, weekly: 1800, monthly: 6800 },
    stock: 3,
    availableUntil: "2027-01-20 23:59",
    availableHours: 720,
  },
  {
    id: "metal-4090-8x-nvlink-anhui",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "安徽",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 2000,
    pricing: { hourly: 11.6, daily: 260, weekly: 1680, monthly: 6400 },
    stock: 2,
    availableUntil: "2027-06-30 12:00",
    availableHours: 1680,
  },
  {
    id: "metal-4090-8x-nvlink-fujian",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "福建",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 960,
    systemDiskGb: 500,
    dataDiskGb: 1800,
    pricing: { hourly: 12.0, daily: 270, weekly: 1750, monthly: 6600 },
    stock: 1,
    availableUntil: "2027-07-05 18:00",
    availableHours: 3360,
  },
  {
    id: "metal-4090-4x-standalone-sichuan",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "四川",
    networkMode: "standalone",
    gpuCount: 4,
    vcpu: 64,
    memoryGb: 512,
    systemDiskGb: 200,
    dataDiskGb: 1000,
    pricing: { hourly: 5.2, daily: 115, weekly: 750, monthly: 2800 },
    stock: 5,
    availableUntil: "2027-08-01 00:00",
    availableHours: 1440,
  },
  {
    id: "metal-4090-4x-standalone-hainan",
    gpuModelKey: "RTX 4090",
    displayName: "RTX 4090 / 24 GB",
    region: "海南",
    networkMode: "standalone",
    gpuCount: 4,
    vcpu: 64,
    memoryGb: 512,
    systemDiskGb: 200,
    dataDiskGb: 1000,
    pricing: { hourly: 4.8, daily: 108, weekly: 700, monthly: 2600 },
    stock: 4,
    availableUntil: "2027-07-10 08:00",
    availableHours: 2400,
  },
  {
    id: "metal-4090-48g-8x-ib-xinjiang",
    gpuModelKey: "RTX 4090-48G",
    displayName: "RTX 4090-48G / 48 GB",
    region: "新疆",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 18.5, daily: 420, weekly: 2700, monthly: 10200 },
    stock: 2,
    availableUntil: "2027-07-25 20:00",
    availableHours: 5040,
  },
  {
    id: "metal-4090-48g-8x-ib-shanghai",
    gpuModelKey: "RTX 4090-48G",
    displayName: "RTX 4090-48G / 48 GB",
    region: "上海1区",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 1024,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 19.2, daily: 440, weekly: 2850, monthly: 10800 },
    stock: 1,
    availableUntil: "2027-06-28 23:59",
    availableHours: 720,
  },
  {
    id: "metal-a100-8x-nvlink-jiangsu",
    gpuModelKey: "A100-SXM4-80GB",
    displayName: "A100-SXM4-80GB / 80 GB",
    region: "江苏",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 32.0, daily: 720, weekly: 4800, monthly: 18000 },
    stock: 2,
    availableUntil: "2027-09-01 00:00",
    availableHours: 2160,
  },
  {
    id: "metal-a100-8x-nvlink-liaoning",
    gpuModelKey: "A100-SXM4-80GB",
    displayName: "A100-SXM4-80GB / 80 GB",
    region: "辽宁",
    networkMode: "nvlink",
    gpuCount: 8,
    vcpu: 128,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 4000,
    pricing: { hourly: 30.5, daily: 690, weekly: 4600, monthly: 17200 },
    stock: 0,
    availableUntil: "2027-07-15 12:00",
    availableHours: 360,
  },
  {
    id: "metal-h100-8x-ib-shanghai",
    gpuModelKey: "H100-SXM",
    displayName: "H100-SXM / 80 GB",
    region: "上海1区",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 160,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 8000,
    pricing: { hourly: 58.0, daily: 1320, weekly: 8800, monthly: 33000 },
    stock: 1,
    availableUntil: "2027-07-08 06:00",
    availableHours: 1200,
  },
  {
    id: "metal-h100-8x-ib-sichuan",
    gpuModelKey: "H100-SXM",
    displayName: "H100-SXM / 80 GB",
    region: "四川",
    networkMode: "infiniband",
    gpuCount: 8,
    vcpu: 160,
    memoryGb: 2048,
    systemDiskGb: 500,
    dataDiskGb: 8000,
    pricing: { hourly: 55.0, daily: 1250, weekly: 8400, monthly: 31500 },
    stock: 2,
    availableUntil: "2027-08-15 18:00",
    availableHours: 1680,
  },
  {
    id: "metal-5090-4x-roce-anhui",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "安徽",
    networkMode: "roce",
    gpuCount: 4,
    vcpu: 72,
    memoryGb: 576,
    systemDiskGb: 300,
    dataDiskGb: 1500,
    pricing: { hourly: 8.5, daily: 190, weekly: 1250, monthly: 4700 },
    stock: 3,
    availableUntil: "2027-07-12 23:59",
    availableHours: 2880,
  },
  {
    id: "metal-5090-4x-roce-fujian",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "福建",
    networkMode: "roce",
    gpuCount: 4,
    vcpu: 72,
    memoryGb: 576,
    systemDiskGb: 300,
    dataDiskGb: 1500,
    pricing: { hourly: 8.8, daily: 198, weekly: 1300, monthly: 4900 },
    stock: 2,
    availableUntil: "2027-07-18 16:00",
    availableHours: 4080,
  },
  {
    id: "metal-5090-2x-standalone-xinjiang",
    gpuModelKey: "RTX 5090",
    displayName: "RTX 5090 / 32 GB",
    region: "新疆",
    networkMode: "standalone",
    gpuCount: 2,
    vcpu: 36,
    memoryGb: 288,
    systemDiskGb: 200,
    dataDiskGb: 800,
    pricing: { hourly: 3.6, daily: 82, weekly: 540, monthly: 2000 },
    stock: 6,
    availableUntil: "2027-08-20 12:00",
    availableHours: 960,
  },
]

// GPU runtime metadata（与 mock 保持一致）
const GPU_RUNTIME: Record<string, { maxCuda: string; driverVersion: string }> = {
  "RTX 4090": { maxCuda: "13.0", driverVersion: "570.86.10" },
  "RTX 4090-48G": { maxCuda: "13.0", driverVersion: "570.86.10" },
  "RTX 5090": { maxCuda: "13.0", driverVersion: "580.65.06" },
  "A100-SXM4-80GB": { maxCuda: "12.4", driverVersion: "550.127.08" },
  "H100-SXM": { maxCuda: "13.0", driverVersion: "570.86.10" },
}

// Mock GPU model → gpu_card_type.code 映射
const GPU_MODEL_TO_CODE: Record<string, string> = {
  "RTX 4090": "4090-24GB",
  "RTX 4090-48G": "4090-48GB",
  "RTX 5090": "5090",
  "A100-SXM4-80GB": "A100-80GB",
  "H100-SXM": "H100",
}

// =============================================================================
// 数据中心定义
// =============================================================================

const MOCK_REGIONS = [
  { code: "js-002", name: "江苏2区", bareMetalRegion: "江苏2区" },
  { code: "ah-001", name: "安徽", bareMetalRegion: "安徽" },
  { code: "fj-001", name: "福建", bareMetalRegion: "福建" },
  { code: "sc-001", name: "四川", bareMetalRegion: "四川" },
  { code: "hi-001", name: "海南", bareMetalRegion: "海南" },
  { code: "xj-001", name: "新疆", bareMetalRegion: "新疆" },
  { code: "sh-001", name: "上海1区", bareMetalRegion: "上海1区" },
  { code: "js-001", name: "江苏", bareMetalRegion: "江苏" },
  { code: "ln-001", name: "辽宁", bareMetalRegion: "辽宁" },
]

// =============================================================================
// Cloud VM & Serverless Mock 数据
// =============================================================================

interface MockComputeSeed {
  id: string
  name: string
  gpuModelKey: string
  region: string
  gpuCount: number
  status: "running" | "stopped" | "creating"
}

const CLOUD_VM_SEEDS: MockComputeSeed[] = [
  {
    id: "vm-a100-jiangsu",
    name: "A100-80GB 训练集群",
    gpuModelKey: "A100-SXM4-80GB",
    region: "江苏",
    gpuCount: 8,
    status: "running",
  },
  {
    id: "vm-h100-shanghai",
    name: "H100 推理集群",
    gpuModelKey: "H100-SXM",
    region: "上海1区",
    gpuCount: 8,
    status: "running",
  },
  {
    id: "vm-4090-sichuan",
    name: "4090 开发环境",
    gpuModelKey: "RTX 4090",
    region: "四川",
    gpuCount: 4,
    status: "stopped",
  },
]

const SERVERLESS_SEEDS: MockComputeSeed[] = [
  {
    id: "sls-a100-shanghai",
    name: "A100 推理端点",
    gpuModelKey: "A100-SXM4-80GB",
    region: "上海1区",
    gpuCount: 2,
    status: "running",
  },
  {
    id: "sls-4090-anhui",
    name: "4090 推理端点",
    gpuModelKey: "RTX 4090",
    region: "安徽",
    gpuCount: 4,
    status: "running",
  },
  {
    id: "sls-h100-sichuan",
    name: "H100 大模型推理",
    gpuModelKey: "H100-SXM",
    region: "四川",
    gpuCount: 8,
    status: "running",
  },
]

// =============================================================================
// 主逻辑
// =============================================================================

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://cloud:cloud@localhost:5432/cloud"
  if (!databaseUrl) {
    console.error("错误：DATABASE_URL 环境变量未设置")
    process.exit(1)
  }

  console.log("=".repeat(60))
  console.log("  裸金属设备种子数据初始化")
  console.log("=".repeat(60))

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool, logger: false })

  try {
    // 1. 创建供应商
    const supplierId = "supplier-demo-001"
    await db
      .insert(supplier)
      .values({
        id: supplierId,
        externalTenantId: "ext-tenant-demo",
        code: "DEMO",
        name: "演示供应商",
        shortName: "演示",
        status: "active",
        source: "seed",
      })
      .onConflictDoNothing()
    console.log("✅ 供应商已创建:", supplierId)

    // 1b. 创建客户和租户（供 Cloud VM / Serverless 使用）
    const customerId = "cust-demo-001"
    await db
      .insert(customer)
      .values({
        id: customerId,
        name: "演示客户",
        type: "B",
        status: "active",
      })
      .onConflictDoNothing()
    console.log("✅ 客户已创建:", customerId)

    const tenantId = "tenant-demo-001"
    await db
      .insert(billingTenant)
      .values({
        id: tenantId,
        customerId,
        name: "演示租户",
        merchantId: "merchant-demo",
        status: "active",
      })
      .onConflictDoNothing()
    console.log("✅ 租户已创建:", tenantId)

    // 2. 创建数据中心
    const dcIdMap = new Map<string, string>()
    for (const region of MOCK_REGIONS) {
      const dcId = `dc-${region.code}`
      dcIdMap.set(region.name, dcId)
      await db
        .insert(dataCenter)
        .values({
          id: dcId,
          supplierId,
          code: region.code,
          name: region.name,
          location: region.name,
          status: "active",
          cooperationStatus: "active",
          bareMetalRegion: region.bareMetalRegion,
        })
        .onConflictDoNothing()
    }
    console.log("✅ 数据中心已创建:", dcIdMap.size, "个")

    // 3. 创建 GPU 卡型（如果不存在则跳过）
    const gpuModelIds = new Map<string, string>()
    for (const [mockKey, code] of Object.entries(GPU_MODEL_TO_CODE)) {
      const gpuId = `gpu-${code.toLowerCase().replace(/[^a-z0-9]/g, "-")}`
      gpuModelIds.set(mockKey, gpuId)
    }
    // GPU 卡型已在 gpu-card-types-nvidia.sql 种子中创建，这里确保引用正确
    // gpu_card_type ID 映射：
    // "4090-24GB" → "gpu-4090-24gb"
    // "4090-48GB" → "gpu-4090-48gb"
    // "5090"      → "gpu-5090"
    // "A100-80GB" → "gpu-a100-80gb"
    // "H100"      → "gpu-h100"
    const GPU_CODE_TO_ID: Record<string, string> = {
      "4090-24GB": "gpu-4090-24gb",
      "4090-48GB": "gpu-4090-48gb",
      "5090": "gpu-5090",
      "A100-80GB": "gpu-a100-80gb",
      H100: "gpu-h100",
    }
    for (const [mockKey, code] of Object.entries(GPU_MODEL_TO_CODE)) {
      gpuModelIds.set(mockKey, GPU_CODE_TO_ID[code] ?? `gpu-${code}`)
    }
    console.log("✅ GPU 卡型引用已就绪")

    // 4. 创建物理设备
    let deviceCount = 0
    const now = new Date()

    for (const seed of MOCK_DEVICE_SEEDS) {
      const dcId = dcIdMap.get(seed.region)
      const gpuCardTypeId = gpuModelIds.get(seed.gpuModelKey)
      if (!dcId || !gpuCardTypeId) {
        console.warn(`  ⚠️ 跳过 ${seed.id}: 未找到数据中心或卡型映射`)
        continue
      }

      const runtime = GPU_RUNTIME[seed.gpuModelKey] ?? { maxCuda: "12.4", driverVersion: "550.127.08" }

      // deviceSpec 存储 mock 中无法映射到标准字段的元数据
      const deviceSpec = JSON.stringify({
        networkMode: seed.networkMode,
        vcpu: seed.vcpu,
        memoryGb: seed.memoryGb,
        systemDiskGb: seed.systemDiskGb,
        dataDiskGb: seed.dataDiskGb,
        maxCuda: runtime.maxCuda,
        driverVersion: runtime.driverVersion,
        pricing: seed.pricing,
        availableUntil: seed.availableUntil,
        availableHours: seed.availableHours,
        displayName: seed.displayName,
      })

      // 为每个 stock 单位创建一条 supplier_device 记录
      const unitsToCreate = Math.max(1, seed.stock)

      for (let i = 0; i < unitsToCreate; i++) {
        const deviceSn = `SN-${seed.id.toUpperCase()}-${String(i + 1).padStart(3, "0")}`
        const deviceId = `${seed.id}-${i + 1}`
        const lifecycleStatus = seed.stock > 0 ? "listed" : "online"
        const opsStatus = seed.stock > 0 ? "可租用" : "预留闲置中"

        await db
          .insert(supplierDevice)
          .values({
            id: deviceId,
            supplierId,
            dataCenterId: dcId,
            gpuCardTypeId,
            externalDeviceId: seed.id,
            sn: deviceSn,
            assetNo: `ASSET-${deviceSn}`,
            idcCode: seed.region,
            idcRegion: seed.region,
            gpuCount: seed.gpuCount,
            opsStatus,
            lifecycleStatus,
            inMaintenance: false,
            cooperationType: "idle_time",
            deviceSpec,
            receivedAt: now,
          })
          .onConflictDoUpdate({
            target: supplierDevice.id,
            set: {
              supplierId,
              dataCenterId: dcId,
              gpuCardTypeId,
              externalDeviceId: seed.id,
              gpuCount: seed.gpuCount,
              opsStatus,
              lifecycleStatus,
              inMaintenance: false,
              cooperationType: "idle_time",
              deviceSpec,
              updatedAt: now,
            },
          })
        deviceCount++
      }
    }
    console.log("✅ 物理设备已创建:", deviceCount, "台")

    // 5. 创建定价记录（supplier_card_list_price）
    // 每个 (supplier, data_center, gpu_card_type) 组合一条记录
    // listPricePerHour = 每 GPU 每小时价格（mock.hourly / gpuCount）
    const pricingEntries = new Map<string, boolean>()
    let pricingCount = 0

    for (const seed of MOCK_DEVICE_SEEDS) {
      if (seed.stock === 0) continue

      const dcId = dcIdMap.get(seed.region)
      const gpuCardTypeId = gpuModelIds.get(seed.gpuModelKey)
      if (!dcId || !gpuCardTypeId) continue

      const key = `${dcId}|${gpuCardTypeId}`
      if (pricingEntries.has(key)) continue
      pricingEntries.set(key, true)

      const perGpuHourly = seed.pricing.hourly / seed.gpuCount

      await db
        .insert(supplierCardListPrice)
        .values({
          id: createId(),
          supplierId,
          dataCenterId: dcId,
          gpuCardTypeId,
          listPricePerHour: String(perGpuHourly.toFixed(4)),
          currency: "CNY",
          effectiveFrom: "2026-01-01",
          source: "seed",
        })
        .onConflictDoNothing()
      pricingCount++
    }
    console.log("✅ 定价记录已创建:", pricingCount, "条")

    // 6. 创建 Cloud VM 实例
    const orgId = "org-demo-001"
    let cloudVmCount = 0

    for (const seed of CLOUD_VM_SEEDS) {
      const dcId = dcIdMap.get(seed.region)
      const gpuCardTypeId = gpuModelIds.get(seed.gpuModelKey)
      if (!dcId || !gpuCardTypeId) {
        console.warn(`  ⚠️ 跳过 Cloud VM ${seed.id}: 未找到数据中心或卡型映射`)
        continue
      }

      const computeId = seed.id

      await db
        .insert(computeBase)
        .values({
          id: computeId,
          organizationId: orgId,
          tenantId,
          productLine: "cloud_vm",
          billingMode: "postpaid",
          commitment: "on_demand",
          name: seed.name,
          status: seed.status,
          region: seed.region,
          idcName: seed.region,
          resourceSpec: {
            gpuCardTypeId,
            gpuCount: seed.gpuCount,
          },
        })
        .onConflictDoNothing()

      await db
        .insert(cloudVmDetail)
        .values({
          id: `cvd-${computeId}`,
          computeBaseId: computeId,
          osType: "linux",
          osVersion: "Ubuntu 22.04",
        })
        .onConflictDoNothing()

      cloudVmCount++
    }
    console.log("✅ Cloud VM 实例已创建:", cloudVmCount, "个")

    // 7. 创建 Serverless 实例
    let serverlessCount = 0

    for (const seed of SERVERLESS_SEEDS) {
      const dcId = dcIdMap.get(seed.region)
      const gpuCardTypeId = gpuModelIds.get(seed.gpuModelKey)
      if (!dcId || !gpuCardTypeId) {
        console.warn(`  ⚠️ 跳过 Serverless ${seed.id}: 未找到数据中心或卡型映射`)
        continue
      }

      const computeId = seed.id

      await db
        .insert(computeBase)
        .values({
          id: computeId,
          organizationId: orgId,
          tenantId,
          productLine: "serverless",
          billingMode: "postpaid",
          commitment: "on_demand",
          name: seed.name,
          status: seed.status,
          region: seed.region,
          idcName: seed.region,
          resourceSpec: {
            gpuCardTypeId,
            gpuCount: seed.gpuCount,
          },
        })
        .onConflictDoNothing()

      await db
        .insert(serverlessDetail)
        .values({
          id: `sld-${computeId}`,
          computeBaseId: computeId,
          faultTolerance: "non_interruptible",
          minReplicas: 1,
          maxReplicas: 1,
          targetPort: 8080,
        })
        .onConflictDoNothing()

      serverlessCount++
    }
    console.log("✅ Serverless 实例已创建:", serverlessCount, "个")

    console.log("\n" + "=".repeat(60))
    console.log("  种子数据初始化完成！")
    console.log("=".repeat(60))
    console.log(`  供应商:     1 个`)
    console.log(`  客户:       1 个`)
    console.log(`  租户:       1 个`)
    console.log(`  数据中心:   ${dcIdMap.size} 个`)
    console.log(`  物理设备:   ${deviceCount} 台`)
    console.log(`  定价记录:   ${pricingCount} 条`)
    console.log(`  Cloud VM:   ${cloudVmCount} 个`)
    console.log(`  Serverless: ${serverlessCount} 个`)
    console.log("=".repeat(60))
  } catch (error) {
    console.error("\n❌ 初始化失败：", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error("未捕获的错误：", err)
  process.exit(1)
})
