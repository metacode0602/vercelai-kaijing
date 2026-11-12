const PII_KEYS = new Set([
  "buyername",
  "buyer_name",
  "customername",
  "name",
  "fullname",
  "phone",
  "buyerphone",
  "buyer_phone",
  "mobile",
  "telephone",
  "email",
  "buyeremail",
  "address",
  "shippingaddress",
  "billingaddress",
  "detailaddress",
  "addressline",
  "address1",
  "address2",
  "consignee",
  "receiver",
  "receivername",
  "receiverphone",
])

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null
  return "仅 Web 可见"
}

export function redactUntrustedText(value: string | null | undefined, max = 200): string | null {
  if (!value) return null
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function isPiiKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return PII_KEYS.has(normalized) || normalized.includes("phone") || normalized.includes("address") || normalized.endsWith("email")
}

export function redactRecord(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return undefined
  if (Array.isArray(value)) return value.map((item) => redactRecord(item, depth + 1))
  if (typeof value !== "object") return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "raw" || key === "payloadRaw") continue
    if (isPiiKey(key)) {
      output[key] = item ? "仅 Web 可见" : null
      continue
    }
    output[key] = redactRecord(item, depth + 1)
  }
  return output
}
