export type InventoryPriceWriteKind = "inventory" | "price"

export function parseInventoryPriceWriteTarget(
  target: string | null | undefined,
): { listingId?: string; kind?: InventoryPriceWriteKind } {
  if (!target) return {}
  const match = /^listing:([^#\s]+)(?:#(inventory|price))?$/.exec(target.trim())
  if (!match?.[1]) return {}
  return {
    listingId: match[1],
    kind: match[2] === "price" || match[2] === "inventory" ? match[2] : undefined,
  }
}

export function resolveWriteKind(
  taskType: string | null | undefined,
  targetKind?: InventoryPriceWriteKind,
): InventoryPriceWriteKind {
  if (targetKind) return targetKind
  return taskType === "price" ? "price" : "inventory"
}
