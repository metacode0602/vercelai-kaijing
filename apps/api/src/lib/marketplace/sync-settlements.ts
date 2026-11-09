import { nanoid } from "nanoid"
import { integrationLogs, settlementLines, settlements } from "@workspace/db"
import type {
  DomainSettlement,
  DomainSettlementLine,
} from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isLazopPlatform } from "./app-env"
import type { MarketplaceSyncShop } from "./sync"

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

async function upsertSettlement(
  shop: MarketplaceSyncShop,
  settlement: DomainSettlement,
  now: Date
): Promise<string | null> {
  if (!settlement.externalSettlementId) return null
  const values = {
    organizationId: shop.organizationId,
    shopId: shop.id,
    externalSettlementId: settlement.externalSettlementId,
    currency: settlement.currency ?? shop.currency,
    billAmount: settlement.billAmount,
    itemRevenue: settlement.itemRevenue,
    otherRevenueTotal: settlement.otherRevenueTotal,
    subtotal1: settlement.subtotal1,
    subtotal2: settlement.subtotal2,
    refundsAmount: settlement.refundsAmount,
    feesOnRefundsTotal: settlement.feesOnRefundsTotal,
    shipmentFee: settlement.shipmentFee,
    shipmentFeeCredit: settlement.shipmentFeeCredit,
    feesTotal: settlement.feesTotal,
    guaranteeDeposit: settlement.guaranteeDeposit,
    openingBalance: settlement.openingBalance,
    closingBalance: settlement.closingBalance,
    payoutAmount: settlement.payoutAmount,
    payoutStatus: settlement.payoutStatus,
    paidAt: settlement.paid ? asDate(settlement.updatedAt) ?? now : null,
    platformCreatedAt: asDate(settlement.createdAt),
    platformUpdatedAt: asDate(settlement.updatedAt),
    status: settlement.paid ? "paid" : "pending",
    raw: settlement.raw ?? {},
  }

  const [row] = await db
    .insert(settlements)
    .values(values)
    .onConflictDoUpdate({
      target: [settlements.shopId, settlements.externalSettlementId],
      set: {
        currency: values.currency,
        billAmount: values.billAmount,
        itemRevenue: values.itemRevenue,
        otherRevenueTotal: values.otherRevenueTotal,
        subtotal1: values.subtotal1,
        subtotal2: values.subtotal2,
        refundsAmount: values.refundsAmount,
        feesOnRefundsTotal: values.feesOnRefundsTotal,
        shipmentFee: values.shipmentFee,
        shipmentFeeCredit: values.shipmentFeeCredit,
        feesTotal: values.feesTotal,
        guaranteeDeposit: values.guaranteeDeposit,
        openingBalance: values.openingBalance,
        closingBalance: values.closingBalance,
        payoutAmount: values.payoutAmount,
        payoutStatus: values.payoutStatus,
        paidAt: values.paidAt,
        platformCreatedAt: values.platformCreatedAt,
        platformUpdatedAt: values.platformUpdatedAt,
        status: values.status,
        raw: values.raw,
      },
    })
    .returning({ id: settlements.id })
  return row?.id ?? null
}

async function upsertSettlementLine(
  shop: MarketplaceSyncShop,
  settlementId: string,
  line: DomainSettlementLine
) {
  if (!line.externalTransactionId) return
  await db
    .insert(settlementLines)
    .values({
      id: nanoid(),
      settlementId,
      organizationId: shop.organizationId,
      feeKind: line.feeKind,
      feeType: line.feeType,
      feeName: line.feeName,
      transactionType: line.transactionType,
      externalTransactionId: line.externalTransactionId,
      externalOrderNo: line.externalOrderNo,
      amount: line.amount,
      taxAmount: line.taxAmount,
      whtAmount: line.whtAmount,
      whtIncludedInAmount: Boolean(line.whtIncludedInAmount),
      currency: line.currency ?? shop.currency,
      paidStatus: line.paidStatus,
      paymentReference: line.paymentReference,
      sellerSku: line.sellerSku,
      platformSkuId: line.platformSkuId,
      shippingProvider: line.shippingProvider,
      shippingSpeed: line.shippingSpeed,
      shipmentType: line.shipmentType,
      note: line.note,
    })
    .onConflictDoUpdate({
      target: [
        settlementLines.settlementId,
        settlementLines.externalTransactionId,
      ],
      set: {
        feeKind: line.feeKind,
        feeType: line.feeType,
        feeName: line.feeName,
        transactionType: line.transactionType,
        externalOrderNo: line.externalOrderNo,
        amount: line.amount,
        taxAmount: line.taxAmount,
        whtAmount: line.whtAmount,
        whtIncludedInAmount: Boolean(line.whtIncludedInAmount),
        currency: line.currency ?? shop.currency,
        paidStatus: line.paidStatus,
        paymentReference: line.paymentReference,
        sellerSku: line.sellerSku,
        platformSkuId: line.platformSkuId,
        shippingProvider: line.shippingProvider,
        shippingSpeed: line.shippingSpeed,
        shipmentType: line.shipmentType,
        note: line.note,
      },
    })
}

/** Per-shop bucket for finance lines missing statement_number — not a fake payout. */
export const UNASSIGNED_SETTLEMENT_EXTERNAL_ID = "__unassigned__"

export async function syncSettlementsForShop(
  shop: MarketplaceSyncShop,
  now: Date
): Promise<{
  settlements: number
  lines: number
  unassignedLines: number
}> {
  if (!isLazopPlatform(shop.platform)) {
    return { settlements: 0, lines: 0, unassignedLines: 0 }
  }
  const connector = await createShopConnector(shop)
  if (!connector.listSettlements || !connector.listSettlementTransactions) {
    return { settlements: 0, lines: 0, unassignedLines: 0 }
  }

  const lookbackDays = envInt("MARKETPLACE_SYNC_SETTLEMENTS_LOOKBACK_DAYS", 30)
  const createdAfter = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const payouts = await connector.listSettlements({
    createdAfter: ymd(createdAfter),
  })

  const settlementIds = new Map<string, string>()
  let settlementCount = 0
  for (const payout of payouts.items) {
    const id = await upsertSettlement(shop, payout, now)
    if (!id) continue
    settlementIds.set(payout.externalSettlementId, id)
    settlementCount += 1
  }

  const unassignedId =
    (await upsertSettlement(
      shop,
      {
        externalSettlementId: UNASSIGNED_SETTLEMENT_EXTERNAL_ID,
        currency: shop.currency,
        payoutStatus: "unassigned",
        raw: {
          bucket: true,
          note: "Transactions without statement_number land here; order FK left null unless platform provides order_no match later.",
        },
      },
      now
    )) ?? null
  if (unassignedId) {
    settlementIds.set(UNASSIGNED_SETTLEMENT_EXTERNAL_ID, unassignedId)
  }

  const maxPages = envInt("MARKETPLACE_SYNC_SETTLEMENTS_TX_MAX_PAGES", 5)
  let cursor: string | null | undefined
  let lineCount = 0
  let unassignedLines = 0
  for (let page = 0; page < maxPages; page += 1) {
    const result = await connector.listSettlementTransactions({
      startTime: ymd(createdAfter),
      endTime: ymd(now),
      cursor: cursor ?? null,
      pageSize: 200,
    })
    for (const line of result.items) {
      const statement = line.statement?.trim()
      let settlementId = statement ? settlementIds.get(statement) : undefined
      if (!settlementId && statement) {
        settlementId =
          (await upsertSettlement(
            shop,
            {
              externalSettlementId: statement,
              currency: line.currency ?? shop.currency,
              raw: { derivedFromTransaction: true },
            },
            now
          )) ?? undefined
        if (settlementId) settlementIds.set(statement, settlementId)
      }
      let assignedUnassigned = false
      if (!settlementId) {
        if (!unassignedId) {
          await db.insert(integrationLogs).values({
            shopId: shop.id,
            direction: "in",
            action: "settlements.transaction.skip",
            status: "error",
            message: "transaction missing statement and unassigned bucket unavailable",
            payloadSummary: JSON.stringify({
              externalTransactionId: line.externalTransactionId,
            }).slice(0, 2000),
          })
          continue
        }
        settlementId = unassignedId
        assignedUnassigned = true
        await db.insert(integrationLogs).values({
          shopId: shop.id,
          direction: "in",
          action: "settlements.transaction.unassigned",
          status: "success",
          message: `transaction ${line.externalTransactionId} stored under ${UNASSIGNED_SETTLEMENT_EXTERNAL_ID}`,
          payloadSummary: JSON.stringify({
            externalTransactionId: line.externalTransactionId,
            externalOrderNo: line.externalOrderNo ?? null,
            // order FK intentionally not invented
          }).slice(0, 2000),
        })
      }
      // Do not invent orderId FK from free-text order_no; leave null unless already linked elsewhere.
      await upsertSettlementLine(shop, settlementId, line)
      lineCount += 1
      if (assignedUnassigned) unassignedLines += 1
    }
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }

  return { settlements: settlementCount, lines: lineCount, unassignedLines }
}
