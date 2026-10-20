import { isBalanceSnapshotEnabled } from '@/lib/server/dataaccess/crm/balance-snapshot-config'
import { isBillingSyncEnabled } from '@/lib/server/dataaccess/crm/billing-sync-config'
import { registerBalanceSnapshotCron } from '@/lib/server/jobs/register-balance-snapshot-cron'
import { registerBillingSyncCron } from '@/lib/server/jobs/register-billing-sync-cron'
import { registerBareMetalOrderSyncCron } from '@/lib/server/jobs/register-bare-metal-order-sync-cron'
import { registerDiscountTemplateSyncCron } from '@/lib/server/jobs/register-discount-template-sync-cron'
import { isBareMetalOrderSyncEnabled } from '@/lib/server/dataaccess/supplier/bare-metal-order-sync-config'
import { isDevicePlatformProbeEnabled } from '@/lib/server/dataaccess/supplier/device-platform-probe-config'
import { registerDevicePlatformProbeCron } from '@/lib/server/jobs/register-device-platform-probe-cron'
import { registerFeishuBitableSyncCron } from '@/lib/server/jobs/register-feishu-bitable-sync-cron'
import { registerSlaRollupCron } from '@/lib/server/jobs/register-sla-rollup-cron'
import { registerMerchantRollupCron } from '@/lib/server/jobs/register-merchant-rollup-cron'
import { registerAutoListingEngineCron } from '@/lib/server/jobs/register-auto-listing-engine-cron'
import { registerSupplierBillingCron } from '@/lib/server/jobs/register-supplier-billing-cron'
import { isSupplierBillingEnabled } from '@/lib/server/dataaccess/supplier/supplier-billing-config'
import { registerMerchantVoucherExpiryCron } from '@/lib/server/jobs/register-voucher-expiry-cron'
import { isMerchantVoucherExpiryEnabled } from '@/lib/server/dataaccess/merchant/voucher-expiry-config'
import { registerMerchantReconCron } from '@/lib/server/jobs/register-merchant-recon-cron'

export type CronInitResult = {
  ok: true
  alreadyInitialized: boolean
  jobs: {
    billingSync: { enabled: boolean }
    balanceSnapshot: { enabled: boolean }
    bareMetalOrderSync: { enabled: boolean }
    devicePlatformProbe: { enabled: boolean }
    slaRollup: { enabled: boolean }
    merchantRollup: { enabled: boolean }
    autoListingEngine: { enabled: boolean }
    supplierBilling: { enabled: boolean }
    merchantVoucherExpiry: { enabled: boolean }
    merchantRecon: { enabled: boolean }
  }
}

let initialized = false
let initPromise: Promise<CronInitResult> | null = null

function runInit(): CronInitResult {
  registerBillingSyncCron()
  registerDiscountTemplateSyncCron()
  registerBalanceSnapshotCron()
  registerBareMetalOrderSyncCron()
  registerDevicePlatformProbeCron()
  registerFeishuBitableSyncCron()
  registerSlaRollupCron()
  registerMerchantRollupCron()
  registerAutoListingEngineCron()
  registerSupplierBillingCron()
  registerMerchantVoucherExpiryCron()
  registerMerchantReconCron()

  initialized = true
  return {
    ok: true,
    alreadyInitialized: false,
    jobs: {
      billingSync: { enabled: isBillingSyncEnabled() },
      balanceSnapshot: { enabled: isBalanceSnapshotEnabled() },
      bareMetalOrderSync: { enabled: isBareMetalOrderSyncEnabled() },
      devicePlatformProbe: { enabled: isDevicePlatformProbeEnabled() },
      slaRollup: { enabled: true },
      merchantRollup: { enabled: true },
      autoListingEngine: { enabled: true },
      supplierBilling: { enabled: isSupplierBillingEnabled() },
      merchantVoucherExpiry: { enabled: isMerchantVoucherExpiryEnabled() },
      merchantRecon: { enabled: true },
    },
  }
}

export function initCronJobs(): Promise<CronInitResult> {
  if (initialized) {
    return Promise.resolve({
      ok: true,
      alreadyInitialized: true,
      jobs: {
        billingSync: { enabled: isBillingSyncEnabled() },
        balanceSnapshot: { enabled: isBalanceSnapshotEnabled() },
          bareMetalOrderSync: { enabled: isBareMetalOrderSyncEnabled() },
        devicePlatformProbe: { enabled: isDevicePlatformProbeEnabled() },
        slaRollup: { enabled: true },
        merchantRollup: { enabled: true },
        autoListingEngine: { enabled: true },
        supplierBilling: { enabled: isSupplierBillingEnabled() },
        merchantVoucherExpiry: { enabled: isMerchantVoucherExpiryEnabled() },
        merchantRecon: { enabled: true },
      },
    })
  }

  initPromise ??= Promise.resolve().then(runInit)
  return initPromise
}
