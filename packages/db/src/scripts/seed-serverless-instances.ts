/**
 * Serverless 实例种子数据初始化脚本
 *
 * 生成用于 /console/serverless/instances 页面展示的 DB 数据。
 * 包含多种状态（running / stopped / error）的真实 Serverless 实例。
 *
 * 用法：
 *   DATABASE_URL=postgresql://... npx tsx packages/db/src/scripts/seed-serverless-instances.ts
 *
 * 前置条件：先运行 seed-metal-devices.ts（创建 supplier, customer, billingTenant, data_center, gpu_card_type）。
 * 幂等性：使用 ON CONFLICT DO NOTHING，可重复执行。
 */

import { createId } from "@paralleldrive/cuid2"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import {
  computeBase,
  serverlessDetail,
} from "../schema"

// =============================================================================
// Mock 数据
// =============================================================================

interface ServerlessSeed {
  id: string
  name: string
  serviceName: string
  gpuCardTypeId: string
  gpuCount: number
  region: string
  status: "creating" | "running" | "stopped" | "error"
  faultTolerance: "interruptible" | "non_interruptible"
  minReplicas: number
  maxReplicas: number
  targetPort: number
  image: string
  command: string | null
  envVars: Record<string, string>
  publicUrl: string | null
  endpointUrl: string | null
  skyServeId: string | null
  commitment: string
}

const SERVERLESS_SEEDS: ServerlessSeed[] = [
  {
    id: "ep-vllm-llama3",
    name: "vllm-llama3",
    serviceName: "vllm-llama3",
    gpuCardTypeId: "gpu-h100",
    gpuCount: 1,
    region: "cn-beijing",
    status: "running",
    faultTolerance: "non_interruptible",
    minReplicas: 1,
    maxReplicas: 3,
    targetPort: 8000,
    image: "vllm/vllm-openai:latest",
    command: null,
    envVars: { MODEL: "meta-llama/Meta-Llama-3-8B-Instruct" },
    publicUrl: "https://ep-vllm-llama3.serve.gongji.cloud",
    endpointUrl: "https://ep-vllm-llama3.serve.gongji.cloud",
    skyServeId: "sky-ep-vllm-llama3",
    commitment: "on_demand",
  },
  {
    id: "ep-comfyui-prod",
    name: "comfyui-prod",
    serviceName: "comfyui-prod",
    gpuCardTypeId: "gpu-4090-24gb",
    gpuCount: 1,
    region: "cn-guangzhou",
    status: "running",
    faultTolerance: "interruptible",
    minReplicas: 0,
    maxReplicas: 2,
    targetPort: 8188,
    image: "gpurun/comfyui:latest",
    command: null,
    envVars: { COMFYUI_PORT: "8188" },
    publicUrl: "https://ep-comfyui-prod.serve.gongji.cloud",
    endpointUrl: "https://ep-comfyui-prod.serve.gongji.cloud",
    skyServeId: "sky-ep-comfyui-prod",
    commitment: "on_demand",
  },
  {
    id: "ep-embedding-api",
    name: "embedding-api",
    serviceName: "embedding-api",
    gpuCardTypeId: "gpu-a100-80gb",
    gpuCount: 2,
    region: "cn-beijing",
    status: "stopped",
    faultTolerance: "non_interruptible",
    minReplicas: 1,
    maxReplicas: 4,
    targetPort: 8080,
    image: "ghcr.io/huggingface/text-embeddings-inference:1.5",
    command: null,
    envVars: { MODEL_ID: "BAAI/bge-large-en-v1.5" },
    publicUrl: "https://ep-embedding-api.serve.gongji.cloud",
    endpointUrl: "https://ep-embedding-api.serve.gongji.cloud",
    skyServeId: "sky-ep-embedding-api",
    commitment: "monthly",
  },
  {
    id: "ep-stable-diffusion",
    name: "sd-webui-api",
    serviceName: "sd-webui-api",
    gpuCardTypeId: "gpu-4090-24gb",
    gpuCount: 1,
    region: "cn-guangzhou",
    status: "error",
    faultTolerance: "non_interruptible",
    minReplicas: 1,
    maxReplicas: 1,
    targetPort: 7860,
    image: "comfyui/comfyui:latest",
    command: null,
    envVars: {},
    publicUrl: null,
    endpointUrl: null,
    skyServeId: null,
    commitment: "on_demand",
  },
  {
    id: "ep-whisper-asr",
    name: "whisper-asr",
    serviceName: "whisper-asr",
    gpuCardTypeId: "gpu-a10",
    gpuCount: 1,
    region: "cn-beijing",
    status: "running",
    faultTolerance: "interruptible",
    minReplicas: 0,
    maxReplicas: 2,
    targetPort: 9000,
    image: "onerahmet/openai-whisper-asr:latest",
    command: null,
    envVars: {_WHISPER_MODEL: "large-v3"},
    publicUrl: "https://ep-whisper-asr.serve.gongji.cloud",
    endpointUrl: "https://ep-whisper-asr.serve.gongji.cloud",
    skyServeId: "sky-ep-whisper-asr",
    commitment: "on_demand",
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
  console.log("  Serverless 实例种子数据初始化")
  console.log("=".repeat(60))

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool, logger: false })

  try {
    const orgId = "org-demo-001"
    const tenantId = "tenant-demo-001"

    let count = 0

    for (const seed of SERVERLESS_SEEDS) {
      // compute_base
      await db
        .insert(computeBase)
        .values({
          id: seed.id,
          organizationId: orgId,
          tenantId,
          productLine: "serverless",
          billingMode: "postpaid",
          commitment: seed.commitment,
          name: seed.name,
          status: seed.status,
          region: seed.region,
          idcName: seed.region,
          resourceSpec: {
            gpuCardTypeId: seed.gpuCardTypeId,
            gpuCount: seed.gpuCount,
          },
          image: seed.image,
        })
        .onConflictDoNothing()

      // serverless_detail
      await db
        .insert(serverlessDetail)
        .values({
          id: `sld-${seed.id}`,
          computeBaseId: seed.id,
          serviceName: seed.serviceName,
          faultTolerance: seed.faultTolerance,
          minReplicas: seed.minReplicas,
          maxReplicas: seed.maxReplicas,
          targetPort: seed.targetPort,
          command: seed.command,
          envVars: seed.envVars,
          publicUrl: seed.publicUrl,
          endpointUrl: seed.endpointUrl,
          skyServeId: seed.skyServeId,
        })
        .onConflictDoNothing()

      count++
    }

    console.log(`✅ Serverless 实例已创建: ${count} 个`)
    console.log(`  - running: ${SERVERLESS_SEEDS.filter((s) => s.status === "running").length}`)
    console.log(`  - stopped: ${SERVERLESS_SEEDS.filter((s) => s.status === "stopped").length}`)
    console.log(`  - error:   ${SERVERLESS_SEEDS.filter((s) => s.status === "error").length}`)
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
