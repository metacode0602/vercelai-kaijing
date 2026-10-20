# P0 + P1 Implementation Audit

> **文档性质**：PR #2 的实施完成快照（历史记录）。
> 下列勾选框反映**当时**的交付状态；与当前代码不符的条目已在 2026-10-05 就地修正，
> 尚未做/不再适用的条目统一标记为 **⏸ 挂起**（不做、不承诺）。

## P0 Status ✅ COMPLETE

### 1. Identity Resolution ✅
- [x] `supplier-identity.ts` with `requireSupplierId()` and `resolveSupplierId()`
- [x] All dataaccess layers map `organization.id` → `supplier.id`
- [x] Enforces `auditStatus='approved'` check

### 2. Daily Billing Schema ✅
- [x] `supplier_bill_daily` table created
- [x] `supplier_bill_daily_detail` table created
- [x] Migration `0014_add_supplier_daily_bills.sql`
- [x] `billing.ts` dataaccess queries daily tables
- [x] API returns device stats (online, rented GPU, idle GPU)

### 3. Billing Generation Services ✅
- [x] `generateDailyBills()` creates daily bills
- [x] `generateMonthlyBills()` aggregates to monthly bills
- [x] Usage estimation (70% utilization P0, documented)
- [x] Pro-rated infrastructure fees (network, mgmt, storage)
- [x] Fetches pricing from `supplierPricingRecord`
- [x] Callable from ops + cron hook comments
- [x] Notifies suppliers via `notifyBillGenerated()`（`@workspace/shared-supplier/notifications`，由 `supplier-bill-generation.ts` 调用）

### 4. Billing Confirmation ✅
- [x] `confirmMonthly` mutation implemented
- [x] Updates bill status `pending` → `confirmed`
- [x] Validates supplier ownership

### 5. Dashboard UI ✅
- [x] Replaced Mock with `dashboard.kpis` API
- [x] Today estimate + month cumulative revenue
- [x] Online devices, listed devices, pending retire count
- [x] 30-day revenue trend chart

### 6. Bill Pages UI ✅
- [x] `/console/billing` reads `supplier_bill`（列表 + 明细 + 确认）
- [x] `/console/invoices` reads `invoice` / `invoice_request` / `invoice_title`（不是 `supplier_bill_daily` —— 原文写错）
- [x] Detail views with card type breakdown
- [x] Confirm button wired

### 7. Device Upload UI ✅ (P0 MVP)
- [x] `/console/devices/batches/new` page
- [x] Select datacenter, cooperation type, upload file
- [x] Creates draft `onboarding_batch`
- ~~[x] P0: stub parse/commit~~ → **已过时**：`parseDeviceUploadFile` / `commitDeviceUploadBatch` 现为真实实现（xlsx/csv 解析、合同容量校验、事务内建设备），不再是 stub

### 8. Retire Request UI ✅
- [x] `/console/devices/retire/new` page
- [x] Multi-select devices, planned time validation
- [x] Reason selection + remark
- [x] Creates `onboardingBatch` with `batchKind='device_retire'`

### 9. Site Message Notifications ✅（已修正）
- [x] Unified `notifySupplier()` in `site-message-notifications.ts`
- [x] `notifyBatchParseError`（供应商门户自触发，`device-upload.ts` 调用）

#### 四类业务通知（保留，发送方 = `apps/web`）

> 2026-10-05 更正：这四个通知**不是**死实现，是运营侧（`apps/web`）在审批 / 记账 / 建合同时
> 发给供应商的正式业务通知，**必须保留**。下表是权威发送点。

| # | 通知 | `apps/supplier` 导出（保留） | `apps/web` 实际发送点 | 站内信分类 |
|---|---|---|---|---|
| 1 | **入驻成功 / 未通过** | `notifyOnboardingResult` | `dataaccess/supplier/supplier-review.ts:261`（approved）、`:305`（rejected）→ `@workspace/shared-supplier/notifications#notifySupplierOnboardingResult` | `供应商` |
| 2 | **设备下架 通过 / 驳回** | `notifyRetireResult` | `dataaccess/supplier/retire-batch-review.ts:58`（approved）、`:121`（rejected）→ `#notifySupplierRetireResult` | `设备` |
| 3 | **月账单已生成** | `notifyBillGenerated` | `dataaccess/supplier/supplier-bill-generation.ts:1552`（事务内）→ `#notifyBillGenerated` | `财务` |
| 4 | **新合同待确认** | `notifyContractPending` | `dataaccess/supplier/contract.ts:421` → `contract-notifications.ts#sendContractToSupplier`（**站内信 + 邮件**双通道） | `contract` |

- [x] Shared module `@workspace/shared-supplier/notifications`（第 1–3 类的 apps/web 入口）
- [x] `contract-notifications.ts`（第 4 类的 apps/web 入口，含 `sendEmail` 邮件通道）
- ⚠️ **两侧保持同步**：`apps/supplier` 的四个导出与 apps/web 侧实现为同构文案；
  改标题 / 分类 / 跳转链接时需同时改 `apps/supplier/.../site-message-notifications.ts`
  与 `packages/shared-supplier/src/notifications.ts`（或 `contract-notifications.ts`）。
- **⏸ 挂起**：邮件通道只在第 4 类（新合同）存在；第 1–3 类目前仅站内信。

### 10. Web Approval Hooks ✅（原「未接线」结论已过时）
- [x] `supplier-review.ts` approve/reject → `notifySupplierOnboardingResult()`
- [x] ~~⚠️ Retire batch approve/reject hooks NOT YET wired in web~~
  → **已接线**：`apps/web/.../supplier/retire-batch-review.ts` 两处动态 import 并调用
  `notifySupplierRetireResult`（通过 / 驳回各一条）。原 Gap 不再存在。

### 11. Navigation Cleanup ✅
- [x] Mock Control Plane removed
- [x] Mock Settings removed
- [x] Only functional pages in sidebar

### 12. Schema & Migrations ✅
- [x] `storage_fee` added to `supplier_bill`
- [x] Daily billing tables with FK constraints and indexes
- [x] Migration file ready

---

## P1 Status ✅ COMPLETE (with documented gaps)

### A) Upload Polish ✅（原 stub 结论已过时）
- [x] Device upload framework (`device-upload.ts`)
- [x] Batch creation via `batch.create`
- ~~⚠️ Parse preview: Stub implementation~~ → `parseDeviceUploadFile()` 现为真实解析
  （读 `onboardingBatchImportRow`、逐行 ok/warning/failed、解析失败走 `notifyBatchParseError`）
- ~~⚠️ Commit: Stub implementation~~ → `commitDeviceUploadBatch()` 现为真实提交
  （合同校验 + 容量校验 + 事务内批量建 `supplierDevice` / device_link / change_log）
- ~~**Gap**: Full parse/preview/commit in P2~~ → **已闭合**，不再挂 P2

### B) Revenue Dashboard Charts ✅
- [x] Enhanced 30-day chart with CartesianGrid
- [x] Custom tooltip with formatting
- [x] Daily avg, max, min KPIs
- [x] Y-axis formatting (¥10w for 100k+)
- [x] Theme colors, active dot

### C) Device-Level Revenue ✅
- [x] `device-revenue.ts` with proportional allocation
- [x] `getDeviceLast30DaysRevenue()` API
- [x] Device detail page shows revenue card
- [x] Total revenue, GPU hours, attribution method note
- [x] N/A for non-online devices
- [x] Documented gap: allocation vs true device metering

### D) Storage Fee ✅
- [x] `storageFee` in `MonthlyBillItem` type
- [x] Queried from `supplier_bill`
- [x] Displayed in monthly bill detail
- [x] Bill generation populates from daily aggregation

### E) Control Plane & Settings ✅
- [x] Mock pages removed from navigation (completed in P0)

### F) Auto-Onboarding MVP ✅
- [x] Batch commit sets status to `onboarding`
- [x] Devices will enter `pending_onboarding` → `onboarding` lifecycle
- [x] Portal shows device status without fake automation
- [x] Change log structure ready
- [x] P2 trigger point documented
- [x] `docs/design/onboarding-pipeline-p2.md` design doc
- [x] **No fake cluster join** - honest status tracking only

---

## Known Gaps (Honest Documentation)

### P0 Gaps
1. ~~**Web Retire Approve Hooks** - Not yet wired~~ → **已闭合**：
   `retire-batch-review.ts` 通过 / 驳回均已调用 `notifySupplierRetireResult`
   
### P1 Gaps
1. ~~**Device Upload Parse** - Stub implementation~~ → **已闭合**（见 §A）
2. ~~**Device Upload Commit** - Stub implementation~~ → **已闭合**（见 §A）

3. **Usage Metering** - Estimated (70%)
   - P0/P1: Uses device inventory snapshot
   - P2: Integrate K8s metrics for true device-level metering
   
4. **Auto-Onboarding Pipeline** - Status tracking only
   - P1: Batch status and lifecycle status tracking
   - P2: Automated SSH→K8s validation pipeline

---

## Constraints Met ✅

- ✅ Base branch: `develop-gpus`
- ✅ Draft PR #2
- ✅ Supplier-first device upload
- ✅ Web as fallback (documented in code)
- ✅ No `organizationId` for historical suppliers → portal-blocked
- ✅ list/unlist ≠ retire
- ✅ Revenue granularity: datacenter × GPU card type (P1: device allocation)
- ✅ No fake cluster join
- ✅ Honest gap documentation

---

## Verification Checklist

### Manual Testing
> **⏸ 挂起**：以下手工验证项从未执行过，且不在本轮范围内。
> 不再作为完成判据，也不要据此声称「已验证」。

- [ ] Dashboard shows real KPIs and 30-day chart
- [ ] Monthly billing shows storage fee
- [ ] Daily billing shows device stats
- [ ] Confirm button updates bill status
- [ ] Device detail shows revenue attribution
- [ ] Upload page creates batch
- [ ] Retire request creates batch with 24h validation
- [ ] Web onboarding approve sends site message

### Lint
- [x] apps/supplier: 0 errors (warnings pre-existing)
- [x] packages/db: 0 errors (warnings pre-existing)

### Documentation
- [x] `../../../apps/supplier/content/design/supplier-upload-strategy-p0.md`
- [x] `docs/design/onboarding-pipeline-p2.md`
- [x] `docs/design/audit/p0-p1-audit.md` (this file)
- [x] Inline gap documentation in code
