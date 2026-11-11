/**
 * 平台刊登状态 → 本地 listings.status 值域。
 *
 * 本地值域（varchar + TS union，见 apps/shop mappers/listings）：
 * draft / pending_review / live / failed / offline。
 *
 * 平台原始态（mapLazopListingStatus 的 submitted/rejected/paused/archived、
 * 以及 GetProductItem 的 Active/Pending QC/Suspended/Deleted 等）必须在落库前
 * 归一到上述值域；否则 UI 映射兜底会把 rejected 显示成「草稿」。
 *
 * @see docs/design/shop-module11-listing-mapping-trpc.md
 * @see docs/design/platform-apis/daraz/daraz-products-api.md §7.2
 */

export type LocalListingStatus = "draft" | "pending_review" | "live" | "failed" | "offline"

export function toLocalListingStatus(raw: string | null | undefined): LocalListingStatus {
  const s = (raw ?? "").trim().toLowerCase()
  if (!s) return "draft"
  // 拒绝/失败优先于 live（如 "Live_Reject"）。
  if (s.includes("reject") || s.includes("fail")) return "failed"
  if (
    s.includes("submitted") ||
    s.includes("pending") ||
    s.includes("audit") ||
    s.includes("qc") ||
    s.includes("approv") ||
    s === "reviewing"
  ) {
    return "pending_review"
  }
  if (
    s.includes("paus") ||
    s.includes("inactiv") ||
    s.includes("suspend") ||
    s.includes("lock") ||
    s.includes("hidden") ||
    s === "unlisted"
  ) {
    return "offline"
  }
  if (
    s.includes("archiv") ||
    s.includes("delet") ||
    s.includes("sold_out") ||
    s === "removed"
  ) {
    return "offline"
  }
  if (s === "live" || s === "active" || s === "1" || s === "on_sale") return "live"
  if (s.includes("live") || s.includes("active")) return "live"
  return "draft"
}

/**
 * 平台拉取/回执后的 publishState：
 * 平台上存在该商品 → published；推送失败由调用方写 sync_failed。
 */
export function publishStateAfterPlatformWrite(): "published" {
  return "published"
}
