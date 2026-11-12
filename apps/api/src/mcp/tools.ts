import {
  hasRequiredScope,
  OPENSHOP_READ_SCOPE,
  OPENSHOP_WRITE_CONFIRM_SCOPE,
  OPENSHOP_WRITE_PENDING_SCOPE,
} from "@workspace/auth"
import {
  assertMcpWriteAllowed,
  candidateStats,
  completeListingSubmitPending,
  createInventoryPushPending,
  createPriceChangePending,
  financeOverview,
  financeProfits,
  getCandidate,
  getDashboardAlerts,
  getDashboardKpis,
  getDashboardTodos,
  getDashboardTrends,
  getListing,
  getOrder,
  getPending,
  getProduct,
  listCandidates,
  listFreight,
  listInventory,
  listInventoryAlerts,
  listListings,
  listingStats,
  listOrderExceptions,
  listOrders,
  listPending,
  listPricingDrafts,
  listSettlements,
  listShopPolicies,
  listSkuCosts,
  listSyncTasks,
  mcpForbiddenWriteActions,
  reportAttribution,
  reportSellThrough,
  reportStockRisk,
  searchProducts,
  suggestPrices,
  type DomainActor,
} from "@workspace/commerce-domain"
import type { AppDatabase } from "@workspace/db"
import type { McpPrincipal } from "./types"

export type ToolAnnotation = {
  readOnlyHint: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export type ToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ToolAnnotation
  requiredScope: string
  kind: "read" | "write"
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>
}

export type ToolContext = {
  db: AppDatabase
  principal: McpPrincipal
  actor: DomainActor
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function requireString(args: Record<string, unknown>, key: string, label: string): string {
  const value = str(args, key)
  if (!value) throw new Error(`缺少${label}`)
  return value
}

function requireNumber(args: Record<string, unknown>, key: string, label: string): number {
  const value = num(args, key)
  if (value == null) throw new Error(`缺少或无效的${label}`)
  return value
}

function queryArgs(args: Record<string, unknown>) {
  return {
    shopId: str(args, "shopId"),
    platform: str(args, "platform"),
    site: str(args, "site") ?? str(args, "country"),
    country: str(args, "country"),
    q: str(args, "q"),
    status: str(args, "status"),
    kind: str(args, "kind"),
    dateFrom: str(args, "dateFrom"),
    dateTo: str(args, "dateTo"),
    timeZone: str(args, "timeZone"),
    limit: num(args, "limit"),
    offset: num(args, "offset"),
  }
}

const READ_SCHEMA = {
  type: "object",
  properties: {
    shopId: { type: "string", description: "可选店铺 ID，必须是本组织 Daraz 斯里兰卡店铺" },
    platform: { type: "string" },
    site: { type: "string" },
    country: { type: "string" },
    q: { type: "string" },
    status: { type: "string" },
    dateFrom: { type: "string" },
    dateTo: { type: "string" },
    timeZone: { type: "string", description: "默认 Asia/Shanghai" },
    limit: { type: "number" },
    offset: { type: "number" },
  },
}

function readTool(
  name: string,
  description: string,
  handler: ToolDef["handler"],
  extraProperties?: Record<string, unknown>,
  required?: string[],
): ToolDef {
  return {
    name,
    description,
    inputSchema: {
      ...READ_SCHEMA,
      properties: { ...READ_SCHEMA.properties, ...extraProperties },
      required,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    requiredScope: OPENSHOP_READ_SCOPE,
    kind: "read",
    handler,
  }
}

const tools: ToolDef[] = [
  readTool("openshop.dashboard.kpis", "读取今日订单、待审与低库存等 KPI（按币种，不跨币种合计）", (ctx, args) =>
    getDashboardKpis(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.dashboard.trends", "读取近几日订单趋势，按币种分列", (ctx, args) =>
    getDashboardTrends(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.dashboard.todos", "读取待办待审列表", (ctx, args) =>
    getDashboardTodos(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.dashboard.alerts", "读取库存预警与失败/已跳过的同步", (ctx, args) =>
    getDashboardAlerts(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.products.search", "搜索 SPU 商品目录", (ctx, args) =>
    searchProducts(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool(
    "openshop.products.get",
    "读取单个 SPU 及其内部 SKU",
    (ctx, args) => getProduct(ctx.db, ctx.principal.organizationId, requireString(args, "id", "商品 ID")),
    { id: { type: "string" } },
    ["id"],
  ),
  readTool("openshop.candidates.list", "列出选品候选", (ctx, args) =>
    listCandidates(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool(
    "openshop.candidates.get",
    "读取单个选品候选",
    (ctx, args) => getCandidate(ctx.db, ctx.principal.organizationId, requireString(args, "id", "候选 ID")),
    { id: { type: "string" } },
    ["id"],
  ),
  readTool("openshop.candidates.stats", "选品候选按状态统计", (ctx, args) =>
    candidateStats(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.listings.list", "列出 Daraz 斯里兰卡刊登", (ctx, args) =>
    listListings(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool(
    "openshop.listings.get",
    "读取单个刊登",
    (ctx, args) => getListing(ctx.db, ctx.principal.organizationId, requireString(args, "id", "刊登 ID")),
    { id: { type: "string" } },
    ["id"],
  ),
  readTool("openshop.listings.stats", "刊登按状态统计", (ctx, args) =>
    listingStats(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.orders.list", "列出订单（买家信息已脱敏，不含 raw）", (ctx, args) =>
    listOrders(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool(
    "openshop.orders.get",
    "读取单个订单（已脱敏）",
    (ctx, args) => getOrder(ctx.db, ctx.principal.organizationId, requireString(args, "id", "订单 ID")),
    { id: { type: "string" } },
    ["id"],
  ),
  readTool("openshop.orders.exceptions", "列出取消待确认等异常订单", (ctx, args) =>
    listOrderExceptions(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.inventory.list", "列出库存余额与可售数量", (ctx, args) =>
    listInventory(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.inventory.alerts", "列出未关闭的库存预警", (ctx, args) =>
    listInventoryAlerts(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.finance.overview", "结算汇总（按币种，不是完整利润）", (ctx, args) =>
    financeOverview(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.finance.settlements", "列出结算单", (ctx, args) =>
    listSettlements(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.finance.profits", "结算口径汇总；完整利润请在 Web 查看", (ctx, args) =>
    financeProfits(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.finance.sku_costs", "列出 SKU 成本", (ctx, args) =>
    listSkuCosts(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.finance.freight", "费用模板与运价卡（不做虚构估算）", (ctx, args) =>
    listFreight(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.pricing.suggest", "返回已保存的定价建议草稿，不现场虚构价格", (ctx, args) =>
    suggestPrices(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.pricing.drafts", "列出 Daraz LK 定价建议草稿", (ctx, args) =>
    listPricingDrafts(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.settings.shop_policy", "查看店铺库存推送与改价回写开关（只读）", (ctx, args) =>
    listShopPolicies(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.reports.sell_through", "按订单行汇总销量", (ctx, args) =>
    reportSellThrough(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.reports.stock_risk", "库存预警与可售为 0 的风险", (ctx, args) =>
    reportStockRisk(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.reports.attribution", "归因报表；暂无数据时如实说明", (ctx, args) =>
    reportAttribution(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool("openshop.pending.list", "列出待审事项（只读）", (ctx, args) =>
    listPending(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  readTool(
    "openshop.pending.get",
    "读取单个待审事项（只读，不能确认）",
    (ctx, args) => getPending(ctx.db, ctx.principal.organizationId, requireString(args, "id", "待审 ID")),
    { id: { type: "string" } },
    ["id"],
  ),
  readTool("openshop.sync.tasks", "列出同步任务，失败/已跳过如实展示", (ctx, args) =>
    listSyncTasks(ctx.db, ctx.principal.organizationId, queryArgs(args)),
  ),
  {
    name: "openshop.pending.create_price_change",
    description: "创建改价待审，不修改刊登售价，也不向平台回写。确认请在 /console/pending。",
    inputSchema: {
      type: "object",
      properties: {
        listingId: { type: "string" },
        shopId: { type: "string" },
        priceAmount: { type: "number" },
        currency: { type: "string" },
        idempotencyKey: { type: "string" },
      },
      required: ["listingId", "priceAmount"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScope: OPENSHOP_WRITE_PENDING_SCOPE,
    kind: "write",
    handler: (ctx, args) =>
      createPriceChangePending(ctx.db, ctx.actor, {
        listingId: requireString(args, "listingId", "刊登 ID"),
        shopId: str(args, "shopId"),
        priceAmount: requireNumber(args, "priceAmount", "售价"),
        currency: str(args, "currency"),
        idempotencyKey: str(args, "idempotencyKey"),
      }),
  },
  {
    name: "openshop.pending.create_inventory_push",
    description: "创建库存推送待审，不向平台推送库存。确认请在 /console/pending。",
    inputSchema: {
      type: "object",
      properties: {
        listingId: { type: "string" },
        shopId: { type: "string" },
        qty: { type: "number" },
        idempotencyKey: { type: "string" },
      },
      required: ["listingId", "qty"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScope: OPENSHOP_WRITE_PENDING_SCOPE,
    kind: "write",
    handler: (ctx, args) =>
      createInventoryPushPending(ctx.db, ctx.actor, {
        listingId: requireString(args, "listingId", "刊登 ID"),
        shopId: str(args, "shopId"),
        qty: requireNumber(args, "qty", "库存数量"),
        idempotencyKey: str(args, "idempotencyKey"),
      }),
  },
  {
    name: "openshop.pending.complete_listing_submit",
    description: "补全刊登提交待审必填项，不确认、不发布到平台。",
    inputSchema: {
      type: "object",
      properties: {
        pendingId: { type: "string" },
        id: { type: "string", description: "与 pendingId 相同，兼容参数名" },
        shopId: { type: "string" },
        sku: { type: "string" },
        sellerSku: { type: "string" },
        title: { type: "string" },
        sellPrice: { type: "number" },
        currency: { type: "string" },
        brandName: { type: "string" },
        categoryPath: { type: "string" },
        categoryExternalId: { type: "string" },
        note: { type: "string" },
        color: { type: "string" },
        size: { type: "string" },
        warehouseCode: { type: "string" },
        logisticsChannel: { type: "string" },
      },
      required: [],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScope: OPENSHOP_WRITE_PENDING_SCOPE,
    kind: "write",
    handler: (ctx, args) =>
      completeListingSubmitPending(ctx.db, ctx.actor, {
        pendingId: str(args, "pendingId") || requireString(args, "id", "待审 ID"),
        shopId: str(args, "shopId"),
        sku: str(args, "sku"),
        sellerSku: str(args, "sellerSku"),
        title: str(args, "title"),
        sellPrice: num(args, "sellPrice"),
        currency: str(args, "currency"),
        brandName: str(args, "brandName"),
        categoryPath: str(args, "categoryPath"),
        categoryExternalId: str(args, "categoryExternalId"),
        note: str(args, "note"),
        color: str(args, "color"),
        size: str(args, "size"),
        warehouseCode: str(args, "warehouseCode"),
        logisticsChannel: str(args, "logisticsChannel"),
      }),
  },
]

const FORBIDDEN_TOOL_NAMES = [
  "openshop.pending.confirm",
  "openshop.pending.reject",
  "openshop.listings.publish",
  "listings.publish",
  "pending.confirm",
  "pending.reject",
]

export function listRegisteredTools(): ToolDef[] {
  return tools
}

export function isForbiddenToolName(name: string): boolean {
  return (
    FORBIDDEN_TOOL_NAMES.includes(name) ||
    mcpForbiddenWriteActions.includes(name as (typeof mcpForbiddenWriteActions)[number])
  )
}

export function toMcpToolList() {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  }
}

export function createToolContext(db: AppDatabase, principal: McpPrincipal): ToolContext {
  return {
    db,
    principal,
    actor: {
      channel: "mcp",
      organizationId: principal.organizationId,
      userId: principal.userId,
      clientId: principal.clientId,
    },
  }
}

export async function callRegisteredTool(
  db: AppDatabase,
  principal: McpPrincipal,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  if (isForbiddenToolName(name) || name.includes("confirm") && name.includes("pending")) {
    if (name.includes("confirm") || name.includes("reject") || name.includes("publish")) {
      try {
        assertMcpWriteAllowed(createToolContext(db, principal).actor, name)
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
      return { ok: false, message: "未注册该工具，且 MCP 不得确认待审或直接写平台。" }
    }
  }
  const tool = tools.find((item) => item.name === name)
  if (!tool) return { ok: false, message: `未注册工具：${name}` }
  if (name === "openshop.pending.confirm" || tool.requiredScope === OPENSHOP_WRITE_CONFIRM_SCOPE) {
    return { ok: false, message: "确认待审未向 Agent 开放，请在 /console/pending 处理。" }
  }
  if (!hasRequiredScope(principal.scopes, tool.requiredScope)) {
    return {
      ok: false,
      message:
        tool.kind === "write"
          ? "当前令牌没有提交待审的授权范围（openshop:write.pending）"
          : "当前令牌没有读取经营数据的授权范围（openshop:read）",
    }
  }
  // 忽略模型传入的 organization_id
  const { organization_id: _ignoredOrg, organizationId: _ignoredOrg2, ...safeArgs } = args
  void _ignoredOrg
  void _ignoredOrg2
  try {
    const data = await tool.handler(createToolContext(db, principal), safeArgs)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
