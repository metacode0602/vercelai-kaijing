/**
 * 店铺可选写入开关：库存推送 / 改价回写。
 * 缺省、null、undefined 一律视为开启，保证已有店铺升级后默认打开。
 */

export const SHOP_INVENTORY_PUSH_DISABLED_REASON = "该店铺已关闭库存推送"
export const SHOP_PRICE_WRITEBACK_DISABLED_REASON = "该店铺已关闭改价回写"

export function isShopWriteSwitchEnabled(value: boolean | null | undefined): boolean {
  return value !== false
}

export function shopWriteSwitchDisabledReason(kind: "inventory" | "price"): string {
  return kind === "inventory"
    ? SHOP_INVENTORY_PUSH_DISABLED_REASON
    : SHOP_PRICE_WRITEBACK_DISABLED_REASON
}
