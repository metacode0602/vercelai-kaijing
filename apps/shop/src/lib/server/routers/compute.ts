import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { db } from "@/lib/db"
import {
  listComputeBases,
  getComputeBaseById,
  listServerlessInstances,
  getServerlessInstance,
  createServerlessInstance,
  updateServerlessStatus,
  updateServerlessDetail,
  deleteServerlessInstance,
  getServerlessDeployOptions,
  appendComputeTaskEvent,
} from "@/lib/server/dataaccess/compute"
import {
  deployService,
  getServiceStatus,
  stopService,
  startService,
  deleteService,
  scaleService,
} from "@/lib/server/services/skypilot"
import {
  buildCreatePayload,
  createWaverlessEndpoint,
  deleteWaverlessEndpoint,
  getWaverlessLifecycleCommand,
  isWaverlessConfigured,
  listWaverlessWorkers,
  patchWaverlessEndpoint,
  scaleWaverlessEndpoint,
  terminateWaverlessWorker,
  WaverlessApiError,
  WaverlessConfigError,
} from "@/lib/server/services/waverless"
import {
  billServerlessCreate,
  billServerlessStop,
  billWaverlessStop,
  resolveTenantId,
  lookupPriceSnapshot,
  estimateFreezeAmount,
} from "@/lib/server/services/billing"
import {
  createBillingContractSnapshot,
  getEndpointBillingVisibility,
} from "@/lib/server/services/waverless-billing"
import { readWaverlessBillingMeta } from "@/lib/server/services/waverless-billing-lifecycle"
import { shouldRejectWaverlessScaleUp } from "@/lib/server/services/waverless-billing-math"
import {
  getOrCreateTenantBalance,
  freezeBalance,
  unfreezeBalance,
} from "@workspace/billing"
import {
  getLogicalAzBinding,
  isWaverlessOrchestrator,
  normalizeRegionAllowlist,
  resolveOrchestratorType,
} from "@/lib/server/config/waverless-regions"
import {
  getServerlessDeployConfig,
  resolvePlacementModeFromConfig,
} from "@/lib/server/config/serverless-deploy-config"
function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function mapWaverlessUserError(err: unknown): Error {
  if (err instanceof WaverlessConfigError) {
    return new Error(`Waverless 暂不可用: ${err.message}`)
  }
  if (err instanceof WaverlessApiError) {
    // Never leak raw provider messages to tenants
    if (err.status === 404) return new Error("资源不存在或无权访问")
    if (err.status === 409) return new Error("操作冲突，请刷新后重试")
    if (err.status === 429) return new Error("服务繁忙，请稍后重试")
    return new Error("编排服务暂时不可用，请稍后重试")
  }
  return err instanceof Error ? err : new Error("未知错误")
}

export const computeRouter = createTRPCRouter({
  /**
   * List cloud VM instances for the current organization
   */
  cloudVmList: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listComputeBases(ctx.organizationId, {
        productLine: "cloud_vm",
        status: input.status,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * List serverless instances for the current organization
   */
  serverlessList: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listServerlessInstances(ctx.organizationId, {
        status: input.status,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get deploy page options (GPU types, regions, templates)
   */
  serverlessDeployOptions: protectedProcedure.query(async () => {
    return getServerlessDeployOptions()
  }),

  /**
   * Get a single serverless instance by ID
   */
  serverlessGetById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getServerlessInstance(input.id, ctx.organizationId)
    }),

  /**
   * Billing visibility for an owned serverless endpoint:
   * create-time contract snapshot + billing windows + customer ledger + supplier cost.
   * Reuses organization ownership (same as serverlessGetById).
   */
  serverlessBillingVisibility: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      const vis = await getEndpointBillingVisibility(db, {
        computeBaseId: input.id,
        organizationId: ctx.organizationId,
        limit: input.limit,
      })
      return {
        ...vis,
        orchestratorType: instance?.orchestratorType ?? null,
      }
    }),

  /**
   * Create a new serverless endpoint
   *
   * Branches on immutable orchestratorType:
   * - skypilot → legacy SkyServe deploy
   * - waverless → Gongji/CN path via waverless control API
   */
  createServerless: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        gpuId: z.string(),
        gpuCount: z.number().int().min(1).max(8),
        /** Legacy SkyPilot single region; optional for waverless auto placement */
        region: z.string().optional(),
        regionAllowlist: z.array(z.string()).default([]),
        placementMode: z.enum(["auto", "pin"]).optional(),
        faultTolerance: z.enum(["interruptible", "non_interruptible"]).default("non_interruptible"),
        commitment: z.enum(["on-demand", "hour", "daily", "weekly", "monthly"]).default("on-demand"),
        image: z.string().min(1),
        minReplicas: z.number().int().min(0).max(1000),
        maxReplicas: z.number().int().min(1).max(1000),
        targetPort: z.number().int().min(1).max(65535).optional(),
        command: z.string().optional(),
        envVars: z.record(z.string(), z.string()).default({}),
        diskSize: z.number().int().min(0).optional(),
        orchestratorType: z.enum(["skypilot", "waverless"]).optional(),
        /** Longest queue wait before scale-up; 0 disables wait-age trigger */
        scaleUpWaitSeconds: z.number().int().min(0).max(3600),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deployCfg = getServerlessDeployConfig()
      if (deployCfg && !deployCfg.gpuCountOptions.includes(input.gpuCount)) {
        throw new Error(
          `gpuCount=${input.gpuCount} 不在允许的选项 ${deployCfg.gpuCountOptions.join(", ")} 中`,
        )
      }

      const id = genId("ep")
      const serviceName = input.name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()

      const placementMode =
        input.placementMode ?? resolvePlacementModeFromConfig()
      const regionAllowlist = normalizeRegionAllowlist(input.regionAllowlist)

      const orchestratorType = resolveOrchestratorType({
        region: input.region,
        orchestratorType: input.orchestratorType,
        placementMode,
        regionAllowlist,
      })

      const azBinding =
        orchestratorType === "waverless" && input.region
          ? getLogicalAzBinding(input.region)
          : undefined

      if (
        orchestratorType === "waverless" &&
        placementMode === "pin" &&
        input.region &&
        !azBinding
      ) {
        throw new Error(
          `区域 ${input.region} 未映射到可售逻辑 AZ，无法使用 pin 模式`,
        )
      }

      if (orchestratorType === "skypilot" && !input.region?.trim()) {
        throw new Error("SkyPilot 部署需要选择区域")
      }

      if (orchestratorType === "waverless" && !isWaverlessConfigured()) {
        throw new Error(
          "Waverless 服务未配置（需要 WAVERLESS_BASE_URL 与 WAVERLESS_SERVICE_API_KEY）",
        )
      }

      // ── Step 1: Billing ──────────────────────────────────────────────
      const billingResult = await billServerlessCreate(db, {
        organizationId: ctx.organizationId,
        computeBaseId: id,
        gpuCardTypeId: input.gpuId,
        gpuCount: input.gpuCount,
        commitment: input.commitment,
      })

      if ("error" in billingResult) {
        throw new Error(billingResult.error)
      }

      const tenantId = billingResult.tenantId

      // Waverless commercial create requires a sell-price snapshot (immutable contract)
      if (
        orchestratorType === "waverless" &&
        !(billingResult.priceSnapshot && billingResult.priceSnapshot.sellPrice > 0)
      ) {
        throw new Error(
          "无法创建 waverless 端点：缺少有效的 Serverless 销售单价（platform_card_price_record）",
        )
      }

      // ── Step 2: Write DB ─────────────────────────────────────────────
      const instance = await createServerlessInstance({
        id,
        organizationId: ctx.organizationId,
        tenantId,
        name: input.name,
        region: input.region?.trim() || regionAllowlist[0] || "",
        image: input.image,
        commitment: input.commitment,
        gpuCardTypeId: input.gpuId,
        gpuCount: input.gpuCount,
        serviceName,
        faultTolerance: input.faultTolerance,
        minReplicas: input.minReplicas,
        maxReplicas: input.maxReplicas,
        targetPort: input.targetPort ?? null,
        command: input.command ?? null,
        envVars: input.envVars,
        orchestratorType,
        logicalAzId: azBinding?.logicalAzId ?? null,
        providerId: azBinding?.providerId ?? null,
        placementMode,
        regionAllowlist,
        scaleUpWaitSeconds: input.scaleUpWaitSeconds,
        waverlessEndpointId: orchestratorType === "waverless" ? id : null,
      })

      // ── Step 2b: Freeze create-time sell + Gongji cost (waverless only) ─
      if (orchestratorType === "waverless" && billingResult.priceSnapshot) {
        await createBillingContractSnapshot(db, {
          computeBaseId: id,
          tenantId,
          organizationId: ctx.organizationId,
          purchaseType:
            input.commitment === "on-demand" ? "on_demand" : input.commitment,
          sellPricePerGpuHour: billingResult.priceSnapshot.sellPrice,
          priceRecordId: billingResult.priceSnapshot.priceRecordId,
          gpuCardTypeId: input.gpuId,
          productLine: "serverless",
          billingUnit: "hour",
        })
      }

      // ── Step 3: Deploy ───────────────────────────────────────────────
      if (orchestratorType === "waverless") {
        const billingMode =
          input.commitment === "on-demand" ? "on_demand" : input.commitment

        const payload = buildCreatePayload({
          computeBaseId: id,
          name: input.name,
          image: input.image,
          placementMode,
          regionAllowlist,
          logicalAzId: azBinding?.logicalAzId ?? null,
          billingMode,
          minReplicas: input.minReplicas,
          maxReplicas: input.maxReplicas,
          scaleUpWaitSeconds: input.scaleUpWaitSeconds,
          targetPort: input.targetPort,
          command: input.command,
          envVars: input.envVars,
          gpuSku: input.gpuId,
          gpuCount: input.gpuCount,
          userId: ctx.user.id,
          tenantId,
        })

        createWaverlessEndpoint(payload, {
          idempotencyKey: `create-${id}`,
          requestId: `gpus-create-${id}`,
        })
          .then(async (result) => {
            // Accepted ≠ Ready: stay provisioning until runtime says ready
            const status =
              result.status === "ready" || result.status === "running"
                ? "running"
                : "creating"
            await updateServerlessStatus(id, ctx.organizationId, status)
            await updateServerlessDetail(id, {
              waverlessEndpointId: result.waverlessEndpointId ?? id,
              publicUrl: result.publicUrl,
              endpointUrl: result.publicUrl,
              providerStatus: result.status,
              desiredGeneration: 1,
              lastSyncedAt: new Date(),
            })
          })
          .catch(async (err) => {
            console.error("[createServerless:waverless]", err)
            await updateServerlessStatus(id, ctx.organizationId, "error")
            await appendComputeTaskEvent({
              computeBaseId: id,
              eventType: "error",
              previousStatus: "creating",
              newStatus: "error",
              description: "Waverless endpoint create failed",
              detail: { code: err instanceof WaverlessApiError ? err.code : "CREATE_FAILED" },
              triggeredBy: ctx.user.id,
            }).catch(() => {})
          })
      } else {
        // Legacy SkyPilot path (unchanged)
        deployService({
          name: serviceName,
          image: input.image,
          ports: input.targetPort ? [input.targetPort] : [8080],
          min_replicas: input.minReplicas,
          max_replicas: input.maxReplicas,
          env: input.envVars,
          command: input.command,
          gpu_type: input.gpuId,
          gpu_count: input.gpuCount,
          region: input.region,
        })
          .then(async (result) => {
            await updateServerlessStatus(id, ctx.organizationId, "running")
            const status = await getServiceStatus(serviceName)
            await updateServerlessDetail(id, {
              publicUrl: status.endpoints.public,
              internalEndpoint: status.endpoints.internal,
              endpointUrl: status.endpoints.public,
              skyServeId: result.name,
            })
          })
          .catch(async () => {
            await updateServerlessStatus(id, ctx.organizationId, "error")
          })
      }

      return {
        ...instance,
        billing: {
          frozen: billingResult.freezeAmount,
          pricePerHour: billingResult.priceSnapshot?.sellPrice ?? 0,
        },
      }
    }),

  /**
   * Stop a serverless endpoint
   */
  stopServerless: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      if (instance.status === "stopped") return instance

      await updateServerlessStatus(input.id, ctx.organizationId, "stopping")

      const tenantId = await resolveTenantId(db, ctx.organizationId)

      if (isWaverlessOrchestrator(instance.orchestratorType)) {
        await billWaverlessStop(db, {
          organizationId: ctx.organizationId,
          computeBaseId: input.id,
          tenantId,
          reason: "stop",
        })

        const externalId = instance.waverlessEndpointId ?? instance.id
        await scaleWaverlessEndpoint(externalId, 0, instance.maxReplicas, {
          idempotencyKey: `stop-${input.id}-${Date.now()}`,
        }).catch((err) => {
          console.error("[stopServerless:waverless]", err)
        })
      } else {
        const gpuCardTypeId = (instance.resourceSpec as Record<string, unknown>)
          ?.gpuCardTypeId as string
        const gpuCount =
          ((instance.resourceSpec as Record<string, unknown>)?.gpuCount as number) ?? 1

        const priceSnapshot = await lookupPriceSnapshot(db, {
          gpuCardTypeId,
          productLine: "serverless",
          billingUnit: "hour",
        })

        if (priceSnapshot && instance.status === "running") {
          await billServerlessStop(db, {
            organizationId: ctx.organizationId,
            computeBaseId: input.id,
            tenantId,
            pricePerHour: priceSnapshot.sellPrice,
            gpuCount,
            startedAt: instance.createdAt,
            orchestratorType: instance.orchestratorType,
          })
        } else {
          const balance = await getOrCreateTenantBalance(db, tenantId, ctx.organizationId)
          const reserved = Number(balance.reservedBalance)
          if (reserved > 0) {
            await unfreezeBalance(db, {
              tenantId,
              organizationId: ctx.organizationId,
              amount: reserved,
              refType: "compute_base",
              refId: input.id,
              description: "Serverless 停止释放冻结",
            })
          }
        }

        if (instance.skyServeId) {
          await stopService(instance.skyServeId).catch(() => {})
        }
      }

      await updateServerlessStatus(input.id, ctx.organizationId, "stopped")
      return getServerlessInstance(input.id, ctx.organizationId)
    }),

  /**
   * Start a serverless endpoint
   */
  startServerless: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")
      if (instance.status === "running") return instance

      await updateServerlessStatus(input.id, ctx.organizationId, "deploying")

      const tenantId = await resolveTenantId(db, ctx.organizationId)
      const gpuCardTypeId = (instance.resourceSpec as Record<string, unknown>)
        ?.gpuCardTypeId as string
      const gpuCount =
        ((instance.resourceSpec as Record<string, unknown>)?.gpuCount as number) ?? 1

      if (instance.commitment === "on_demand" || instance.commitment === "on-demand") {
        const priceSnapshot = await lookupPriceSnapshot(db, {
          gpuCardTypeId,
          productLine: "serverless",
          billingUnit: "hour",
        })

        if (priceSnapshot) {
          const freezeAmount = estimateFreezeAmount(priceSnapshot.sellPrice, gpuCount)
          await freezeBalance(db, {
            tenantId,
            organizationId: ctx.organizationId,
            amount: freezeAmount,
            refType: "compute_base",
            refId: input.id,
            description: "Serverless 启动冻结",
          })
        }
      }

      if (isWaverlessOrchestrator(instance.orchestratorType)) {
        const externalId = instance.waverlessEndpointId ?? instance.id
        await scaleWaverlessEndpoint(
          externalId,
          Math.max(instance.minReplicas, 1),
          instance.maxReplicas,
          {
            scaleUpWaitSeconds: instance.scaleUpWaitSeconds,
            idempotencyKey: `start-${input.id}-${Date.now()}`,
          },
        ).catch((err) => {
          console.error("[startServerless:waverless]", err)
        })
      } else if (instance.skyServeId) {
        await startService(instance.skyServeId).catch(() => {})
      }

      await updateServerlessStatus(input.id, ctx.organizationId, "running")
      return getServerlessInstance(input.id, ctx.organizationId)
    }),

  /**
   * Delete a serverless endpoint
   */
  deleteServerless: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")

      const tenantId = await resolveTenantId(db, ctx.organizationId)

      if (isWaverlessOrchestrator(instance.orchestratorType)) {
        if (instance.status === "running" || instance.status === "stopped") {
          await billWaverlessStop(db, {
            organizationId: ctx.organizationId,
            computeBaseId: input.id,
            tenantId,
            reason: "delete",
          })
        }
        const externalId = instance.waverlessEndpointId ?? instance.id
        await deleteWaverlessEndpoint(externalId, {
          idempotencyKey: `delete-${input.id}`,
        }).catch((err) => {
          console.error("[deleteServerless:waverless]", err)
        })
      } else {
        if (instance.status === "running" || instance.status === "stopped") {
          const gpuCardTypeId = (instance.resourceSpec as Record<string, unknown>)
            ?.gpuCardTypeId as string
          const gpuCount =
            ((instance.resourceSpec as Record<string, unknown>)?.gpuCount as number) ?? 1

          const priceSnapshot = await lookupPriceSnapshot(db, {
            gpuCardTypeId,
            productLine: "serverless",
            billingUnit: "hour",
          })

          if (priceSnapshot && instance.status === "running") {
            await billServerlessStop(db, {
              organizationId: ctx.organizationId,
              computeBaseId: input.id,
              tenantId,
              pricePerHour: priceSnapshot.sellPrice,
              gpuCount,
              startedAt: instance.createdAt,
              orchestratorType: instance.orchestratorType,
            })
          } else {
            const balance = await getOrCreateTenantBalance(db, tenantId, ctx.organizationId)
            const reserved = Number(balance.reservedBalance)
            if (reserved > 0) {
              await unfreezeBalance(db, {
                tenantId,
                organizationId: ctx.organizationId,
                amount: reserved,
                refType: "compute_base",
                refId: input.id,
                description: "Serverless 删除释放冻结",
              })
            }
          }
        }

        if (instance.skyServeId) {
          await deleteService(instance.skyServeId).catch(() => {})
        }
      }

      await deleteServerlessInstance(input.id, ctx.organizationId)
      return { success: true }
    }),

  /**
   * Scale a serverless endpoint
   */
  scaleServerless: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        minReplicas: z.number().int().min(0).max(100),
        maxReplicas: z.number().int().min(1).max(100),
        scaleUpWaitSeconds: z.number().int().min(0).max(3600).optional(),
        regionAllowlist: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(input.id, ctx.organizationId)
      if (!instance) throw new Error("Instance not found")

      let regionAllowlist: string[] | undefined
      if (input.regionAllowlist !== undefined) {
        regionAllowlist = normalizeRegionAllowlist(input.regionAllowlist)
      }

      if (isWaverlessOrchestrator(instance.orchestratorType)) {
        const billingMeta = await readWaverlessBillingMeta(db, input.id)
        if (
          shouldRejectWaverlessScaleUp(billingMeta, input, {
            minReplicas: instance.minReplicas,
            maxReplicas: instance.maxReplicas,
          })
        ) {
          throw new Error(
            "计费已暂停（余额不足）：无法扩容，请先充值并等待结算恢复",
          )
        }
      }

      await updateServerlessDetail(input.id, {
        minReplicas: input.minReplicas,
        maxReplicas: input.maxReplicas,
        ...(input.scaleUpWaitSeconds !== undefined
          ? { scaleUpWaitSeconds: input.scaleUpWaitSeconds }
          : {}),
        ...(regionAllowlist !== undefined
          ? { regionAllowlist }
          : {}),
      })

      if (instance.status === "running") {
        if (isWaverlessOrchestrator(instance.orchestratorType)) {
          const externalId = instance.waverlessEndpointId ?? instance.id
          const scaleUpWaitSeconds =
            input.scaleUpWaitSeconds ?? instance.scaleUpWaitSeconds
          const idempotencyKey = `scale-${input.id}-${Date.now()}`

          if (regionAllowlist !== undefined) {
            await patchWaverlessEndpoint(
              externalId,
              {
                regionAllowlist,
                minReplicas: input.minReplicas,
                maxReplicas: input.maxReplicas,
                scaleUpWaitSeconds,
              },
              { idempotencyKey },
            ).catch((err) => {
              console.error("[scaleServerless:waverless:patch]", err)
            })
          } else {
            await scaleWaverlessEndpoint(
              externalId,
              input.minReplicas,
              input.maxReplicas,
              {
                scaleUpWaitSeconds,
                idempotencyKey,
              },
            ).catch((err) => {
              console.error("[scaleServerless:waverless]", err)
            })
          }
        } else if (instance.skyServeId) {
          await scaleService(
            instance.skyServeId,
            input.minReplicas,
            input.maxReplicas,
          ).catch(() => {})
        }
      }

      return getServerlessInstance(input.id, ctx.organizationId)
    }),

  /**
   * List workers for a serverless endpoint (waverless path).
   * Ownership: organization-scoped computeBase lookup before calling waverless.
   */
  listServerlessWorkers: protectedProcedure
    .input(
      z.object({
        computeBaseId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(
        input.computeBaseId,
        ctx.organizationId,
      )
      if (!instance) {
        // Anti-enumeration: same as missing
        throw new Error("Instance not found")
      }
      if (!isWaverlessOrchestrator(instance.orchestratorType)) {
        return {
          items: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
          orchestratorType: instance.orchestratorType,
          note: "Worker list is only available for waverless endpoints",
        }
      }

      const externalId = instance.waverlessEndpointId ?? instance.id
      try {
        const result = await listWaverlessWorkers(externalId, {
          page: input.page,
          pageSize: input.pageSize,
        })
        // Never expose preheat workers to tenants (product decision #9)
        const items = result.items.filter(
          (w) =>
            !(w as { role?: string }).role?.toLowerCase().includes("preheat") &&
            !(w as { labels?: Record<string, string> }).labels?.["waverless.io/preheat"],
        )
        return {
          ...result,
          items,
          orchestratorType: "waverless" as const,
        }
      } catch (err) {
        throw mapWaverlessUserError(err)
      }
    }),

  /**
   * Ownership-gated worker terminate (waverless).
   * Drain → in-flight tasks marked failed-retryable + Cloud event.
   */
  terminateServerlessWorker: protectedProcedure
    .input(
      z.object({
        computeBaseId: z.string(),
        workerId: z.string().min(1),
        reasonCode: z.string().min(1).max(64),
        reason: z.string().min(1).max(512),
        idempotencyKey: z.string().uuid(),
        drainTimeoutSeconds: z.number().int().min(0).max(600).default(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(
        input.computeBaseId,
        ctx.organizationId,
      )
      if (!instance) {
        throw new Error("Instance not found")
      }
      if (!isWaverlessOrchestrator(instance.orchestratorType)) {
        throw new Error("Worker terminate is only supported on waverless endpoints")
      }

      const tenantId = await resolveTenantId(db, ctx.organizationId)
      const externalId = instance.waverlessEndpointId ?? instance.id
      const requestId = `gpus-term-${input.idempotencyKey}`

      try {
        const command = await terminateWaverlessWorker({
          externalEndpointId: externalId,
          workerId: input.workerId,
          idempotencyKey: input.idempotencyKey,
          reasonCode: input.reasonCode,
          reason: input.reason,
          actor: {
            type: "tenant_user",
            id: ctx.user.id,
            tenantId,
          },
          source: "gpus-console",
          requestId,
          drainTimeoutSeconds: input.drainTimeoutSeconds,
          inFlightPolicy: "failed_retryable",
        })

        await appendComputeTaskEvent({
          computeBaseId: input.computeBaseId,
          eventType: "worker_terminate_requested",
          description: `Worker ${input.workerId} drain/terminate accepted`,
          detail: {
            workerId: input.workerId,
            commandId: command.commandId,
            commandState: command.state,
            reasonCode: input.reasonCode,
            inFlightPolicy: "failed_retryable",
            requestId,
          },
          triggeredBy: ctx.user.id,
        })

        return {
          accepted: true,
          commandId: command.commandId,
          state: command.state,
          message: "正在排空/终止 Worker；在途任务将标记为失败可重试",
        }
      } catch (err) {
        await appendComputeTaskEvent({
          computeBaseId: input.computeBaseId,
          eventType: "worker_terminate_failed",
          description: `Worker ${input.workerId} terminate failed`,
          detail: {
            workerId: input.workerId,
            reasonCode: input.reasonCode,
            error:
              err instanceof WaverlessApiError
                ? { status: err.status, code: err.code }
                : { message: "request_failed" },
          },
          triggeredBy: ctx.user.id,
        }).catch(() => {})
        throw mapWaverlessUserError(err)
      }
    }),

  /**
   * Poll lifecycle command status (ownership-gated via computeBaseId).
   */
  getServerlessLifecycleCommand: protectedProcedure
    .input(
      z.object({
        computeBaseId: z.string(),
        commandId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const instance = await getServerlessInstance(
        input.computeBaseId,
        ctx.organizationId,
      )
      if (!instance) throw new Error("Instance not found")
      if (!isWaverlessOrchestrator(instance.orchestratorType)) {
        throw new Error("Lifecycle commands are only for waverless endpoints")
      }
      try {
        return await getWaverlessLifecycleCommand(input.commandId)
      } catch (err) {
        throw mapWaverlessUserError(err)
      }
    }),

  /**
   * Get a single compute instance by ID (generic)
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getComputeBaseById(input.id, ctx.organizationId)
    }),
})
