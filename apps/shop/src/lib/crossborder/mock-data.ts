export const MOCK_CANDIDATES = [
  { id: "c1", title: "Oversized Cotton Tee", score: 0.91, status: "new", category: "Apparel" },
  { id: "c2", title: "USB-C Hub 7-in-1", score: 0.84, status: "new", category: "Electronics" },
  { id: "c3", title: "Yoga Mat Pro", score: 0.72, status: "accepted", category: "Sports" },
]

export const MOCK_PENDING = [
  { id: "pa1", kind: "listing_submit", title: "刊登 Oversized Cotton Tee", status: "pending" },
  { id: "pa2", kind: "inventory_push", title: "推库存 SKU-HUB-01", status: "pending" },
]

export const MOCK_PRODUCTS = [
  { sku: "TEE-001", title: "Oversized Cotton Tee", listing: "draft", price: "12.50 USD" },
  { sku: "HUB-01", title: "USB-C Hub 7-in-1", listing: "live", price: "24.00 USD" },
]

export const MOCK_ORDERS = [
  { id: "DZ-10021", status: "paid", total: "36.50", placedAt: "2026-10-20 08:12" },
  { id: "DZ-10018", status: "shipped", total: "24.00", placedAt: "2026-10-19 21:03" },
]

export const MOCK_INVENTORY = [
  { sku: "TEE-001", onHand: 12, reserved: 3, threshold: 20, alert: "open" },
  { sku: "HUB-01", onHand: 80, reserved: 5, threshold: 10, alert: null },
]

export const MOCK_COSTS = [
  { sku: "TEE-001", purchase: 4.2, freight: 1.1, duty: 0.3, currency: "USD" },
  { sku: "HUB-01", purchase: 9.5, freight: 2.0, duty: 0.8, currency: "USD" },
]
