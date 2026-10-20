/**
 * 供应商价格工具的**转发层**（W-10）。
 *
 * 实现已统一迁到 `@workspace/billing/pricing-resolver`，本文件只做 re-export，
 * 以免 apps/web 内 8 个调用点（含组件、mapper、dataaccess）出现两套口径。
 * 新代码请直接 import `@workspace/billing/pricing-resolver`。
 */
export {
  DEFAULT_CARDS_PER_MACHINE,
  deriveCardHourPriceFromMonthlyRent,
  daysInNaturalMonth,
  formatCardHourPrice,
  formatMonthlyRentPricingLabel,
  normalizeSupplierBillingUnit,
  resolveCardTimeUnitPrice,
} from '@workspace/billing/pricing-resolver'
export type {
  StoredCardTimePricingInput,
  SupplierBillingUnit,
} from '@workspace/billing/pricing-resolver'
