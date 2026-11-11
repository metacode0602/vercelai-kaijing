/**
 * G8 跨租户店铺绑定政策：冲突键、占用判定、申诉窗口与状态机。
 * 已确认政策见 apps/shop/content/design/shop-binding-conflicts.md。
 */

export const SHOP_BINDING_UNBOUND_STATUS = "unbound"

export const shopBindingConflictStatuses = [
  "pending",
  "upheld",
  "transfer_approved_pending_appeal",
  "appealed_pending_review",
  "released_pending_reauth",
  "closed",
] as const

export type ShopBindingConflictStatus = (typeof shopBindingConflictStatuses)[number]

export const SHOP_BINDING_CONFLICT_STATUS_LABELS: Record<ShopBindingConflictStatus, string> = {
  pending: "待处理",
  upheld: "已维持原绑定",
  transfer_approved_pending_appeal: "已批准待申诉",
  appealed_pending_review: "已申诉待复审",
  released_pending_reauth: "已释放待重新授权",
  closed: "已关闭",
}

export const OPEN_SHOP_BINDING_CONFLICT_STATUSES = [
  "pending",
  "transfer_approved_pending_appeal",
  "appealed_pending_review",
  "released_pending_reauth",
] as const

export type OpenShopBindingConflictStatus =
  (typeof OPEN_SHOP_BINDING_CONFLICT_STATUSES)[number]

export const SHOP_BINDING_TRANSFER_APPEAL_DAYS_ENV = "SHOP_BINDING_TRANSFER_APPEAL_DAYS"
export const DEFAULT_SHOP_BINDING_TRANSFER_APPEAL_DAYS = 3

export function isShopBindingConflictStatus(
  value: string,
): value is ShopBindingConflictStatus {
  return (shopBindingConflictStatuses as readonly string[]).includes(value)
}

export function shopOccupiesBindingSlot(shop: {
  deletedAt?: Date | null
  status: string
}): boolean {
  if (shop.deletedAt) return false
  return shop.status !== SHOP_BINDING_UNBOUND_STATUS
}

export function parseTransferAppealDays(raw: string | undefined | null): number {
  if (raw == null || raw.trim() === "") return DEFAULT_SHOP_BINDING_TRANSFER_APPEAL_DAYS
  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SHOP_BINDING_TRANSFER_APPEAL_DAYS
  return parsed
}

export function getTransferAppealDays(
  env: Record<string, string | undefined> = process.env,
): number {
  return parseTransferAppealDays(env[SHOP_BINDING_TRANSFER_APPEAL_DAYS_ENV])
}

export function computeAppealDeadline(now: Date, days: number): Date | null {
  if (days <= 0) return null
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

export type BindingConflictAction =
  | "uphold"
  | "approve_transfer"
  | "appeal"
  | "accept_appeal"
  | "reject_appeal"
  | "expire_appeal_window"
  | "occupant_unbind"
  | "challenger_reauth_success"

export type BindingConflictDecision = {
  status: ShopBindingConflictStatus
  releaseOccupantSlot: boolean
  grantChallengerReauth: boolean
  closeChallengerDraft: boolean
  appealDeadlineAt: Date | null
}

export function decideBindingConflictTransition(input: {
  current: ShopBindingConflictStatus
  action: BindingConflictAction
  appealDays: number
  now: Date
  appealDeadlineAt?: Date | null
}): BindingConflictDecision {
  const unchangedDeadline = input.appealDeadlineAt ?? null

  if (input.action === "occupant_unbind") {
    if (input.current === "closed" || input.current === "upheld") {
      throw new Error("该冲突单已结案，无法再因解绑变更")
    }
    if (input.current === "released_pending_reauth") {
      return {
        status: "released_pending_reauth",
        releaseOccupantSlot: true,
        grantChallengerReauth: true,
        closeChallengerDraft: false,
        appealDeadlineAt: unchangedDeadline,
      }
    }
    return {
      status: "released_pending_reauth",
      releaseOccupantSlot: true,
      grantChallengerReauth: true,
      closeChallengerDraft: false,
      appealDeadlineAt: unchangedDeadline,
    }
  }

  if (input.action === "challenger_reauth_success") {
    if (input.current !== "released_pending_reauth") {
      throw new Error("仅已释放待重新授权的冲突单可在后来者授权成功后关闭")
    }
    return {
      status: "closed",
      releaseOccupantSlot: false,
      grantChallengerReauth: false,
      closeChallengerDraft: false,
      appealDeadlineAt: unchangedDeadline,
    }
  }

  if (input.action === "uphold") {
    if (input.current !== "pending") {
      throw new Error("只有待处理的冲突单可以维持原绑定")
    }
    return {
      status: "upheld",
      releaseOccupantSlot: false,
      grantChallengerReauth: false,
      closeChallengerDraft: true,
      appealDeadlineAt: null,
    }
  }

  if (input.action === "approve_transfer") {
    if (input.current !== "pending") {
      throw new Error("只有待处理的冲突单可以批准转移")
    }
    if (input.appealDays <= 0) {
      return {
        status: "released_pending_reauth",
        releaseOccupantSlot: true,
        grantChallengerReauth: true,
        closeChallengerDraft: false,
        appealDeadlineAt: null,
      }
    }
    return {
      status: "transfer_approved_pending_appeal",
      releaseOccupantSlot: false,
      grantChallengerReauth: false,
      closeChallengerDraft: false,
      appealDeadlineAt: computeAppealDeadline(input.now, input.appealDays),
    }
  }

  if (input.action === "appeal") {
    if (input.current !== "transfer_approved_pending_appeal") {
      throw new Error("当前不在可申诉窗口内")
    }
    const deadline = unchangedDeadline
    if (deadline && deadline.getTime() < input.now.getTime()) {
      throw new Error("申诉期限已过")
    }
    return {
      status: "appealed_pending_review",
      releaseOccupantSlot: false,
      grantChallengerReauth: false,
      closeChallengerDraft: false,
      appealDeadlineAt: deadline,
    }
  }

  if (input.action === "expire_appeal_window") {
    if (input.current !== "transfer_approved_pending_appeal") {
      throw new Error("当前冲突单不在待申诉状态")
    }
    const deadline = unchangedDeadline
    if (deadline && deadline.getTime() > input.now.getTime()) {
      throw new Error("申诉窗口尚未结束")
    }
    return {
      status: "released_pending_reauth",
      releaseOccupantSlot: true,
      grantChallengerReauth: true,
      closeChallengerDraft: false,
      appealDeadlineAt: deadline,
    }
  }

  if (input.action === "accept_appeal") {
    if (input.current !== "appealed_pending_review") {
      throw new Error("只有已申诉待复审的冲突单可以接受申诉")
    }
    return {
      status: "upheld",
      releaseOccupantSlot: false,
      grantChallengerReauth: false,
      closeChallengerDraft: true,
      appealDeadlineAt: unchangedDeadline,
    }
  }

  if (input.action === "reject_appeal") {
    if (input.current !== "appealed_pending_review") {
      throw new Error("只有已申诉待复审的冲突单可以驳回申诉")
    }
    return {
      status: "released_pending_reauth",
      releaseOccupantSlot: true,
      grantChallengerReauth: true,
      closeChallengerDraft: false,
      appealDeadlineAt: unchangedDeadline,
    }
  }

  throw new Error("不支持的冲突单动作")
}
