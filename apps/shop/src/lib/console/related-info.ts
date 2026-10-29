import type {
  DetailRelatedInfo,
  DetailRelatedParent,
  DetailRelatedSection,
} from '@/components/console/detail/detail-related-list'
import { DEMO_SUPPLIER_SKUS } from '@/lib/crossborder/supplier-sku-store'
import {
  ERP_DEMO_MAPPINGS,
  ERP_DEMO_PRODUCTS,
  findProductBySku,
  findSupplierMasterByName,
  getDemoListingsBySellerSku,
  getDemoListingsBySku,
  getDemoListingsBySpu,
  getDemoSkuPricing,
  type DemoListing,
} from '@/lib/crossborder/erp-ued-data'

export type UedRecord = Record<string, unknown>

function listingRows(listings: DemoListing[]) {
  return listings.map((item) => ({
    id: item.id,
    sku: item.sku,
    shop: item.shop,
    platform: item.platform,
    sellerSku: item.sellerSku,
    title: item.title,
    sellPrice: `${item.sellPrice.toFixed(2)} ${item.currency}`,
    status: item.status,
    stockOnHand: item.stockOnHand,
    href: `/console/listings/${encodeURIComponent(item.id)}`,
  }))
}

const LISTING_COLUMNS = [
  { key: 'id', label: '刊登 ID', mono: true, hrefKey: 'href' },
  { key: 'sku', label: '内部 SKU', mono: true },
  { key: 'shop', label: '店铺' },
  { key: 'platform', label: '平台' },
  { key: 'sellerSku', label: 'Seller SKU', mono: true },
  { key: 'sellPrice', label: '售价', numeric: true },
  { key: 'status', label: '状态' },
  { key: 'stockOnHand', label: '在库', numeric: true },
]

function listingsSection(
  listings: DemoListing[],
  opts?: { title?: string; description?: string },
): DetailRelatedSection {
  return {
    title: opts?.title ?? '刊登列表',
    description:
      opts?.description ?? '该对象关联的平台刊登（示例数据）；售价为店铺侧销售价',
    columns: LISTING_COLUMNS,
    rows: listingRows(listings),
    emptyText: '暂无刊登（示例）',
  }
}

function mappingRows(internalSku: string, excludeSellerSku?: string) {
  return ERP_DEMO_MAPPINGS.filter(
    (item) =>
      item.internalSku === internalSku &&
      !(excludeSellerSku && item.sellerSku === excludeSellerSku),
  ).map((item) => ({
    shop: item.shop,
    sellerSku: item.sellerSku,
    itemId: item.itemId,
    listingStatus: item.listingStatus,
    mappingStatus: item.mappingStatus,
    href: `/console/mappings/${encodeURIComponent(`${item.shop}::${item.sellerSku}`)}`,
  }))
}

function supplierSkuRows(internalSku: string, excludeId?: string) {
  return DEMO_SUPPLIER_SKUS.filter(
    (item) => item.sku === internalSku && item.id !== excludeId,
  ).map((item) => ({
    id: item.id,
    supplier: item.supplier,
    factoryCode: item.factoryCode,
    price: `${item.price} ${item.currency}`,
    preferred: item.preferred ? '是' : '否',
    status: item.status,
    href: `/console/supplier-skus/${encodeURIComponent(item.id)}`,
  }))
}

function buildSkuChildren(
  sku: string,
  opts?: { excludeSupplierSkuId?: string; excludeSellerSku?: string },
) {
  const sections: DetailRelatedSection[] = [
    listingsSection(getDemoListingsBySku(sku), {
      description: `内部 SKU ${sku} 的平台刊登（示例）；含售价`,
    }),
  ]

  const mappings = mappingRows(sku, opts?.excludeSellerSku)
  if (mappings.length > 0) {
    sections.push({
      title: 'Seller SKU 映射',
      description: '店铺侧 Seller SKU 与内部 SKU 的映射',
      columns: [
        { key: 'shop', label: '店铺' },
        { key: 'sellerSku', label: 'Seller SKU', mono: true, hrefKey: 'href' },
        { key: 'itemId', label: 'Item ID', mono: true },
        { key: 'listingStatus', label: '上架状态' },
        { key: 'mappingStatus', label: '映射状态' },
      ],
      rows: mappings,
      emptyText: '暂无映射',
    })
  }

  const suppliers = supplierSkuRows(sku, opts?.excludeSupplierSkuId)
  if (suppliers.length > 0) {
    sections.push({
      title: '供应商货号',
      description: '该内部 SKU 的供应商货号映射',
      columns: [
        { key: 'id', label: '映射 ID', mono: true, hrefKey: 'href' },
        { key: 'supplier', label: '供应商' },
        { key: 'factoryCode', label: '厂家款号', mono: true },
        { key: 'price', label: '采购价', numeric: true },
        { key: 'preferred', label: '首选' },
        { key: 'status', label: '状态' },
      ],
      rows: suppliers,
      emptyText: '暂无供应商货号',
    })
  }

  return sections
}

function parentForSpu(sku: string | undefined): DetailRelatedParent[] {
  if (!sku || sku === '—') return []
  const product = findProductBySku(sku)
  if (!product) return []
  return [
    {
      label: '所属 SPU',
      value: `${product.spu} · ${product.name}`,
      href: `/console/master-products/${encodeURIComponent(product.spu)}`,
      mono: true,
    },
  ]
}

function parentForInternalSku(sku: string | undefined): DetailRelatedParent[] {
  if (!sku || sku === '—') return []
  return [
    {
      label: '内部 SKU',
      value: sku,
      href: `/console/master-skus/${encodeURIComponent(sku)}`,
      mono: true,
    },
  ]
}

/**
 * Build classified related-info for UED detail pages.
 * Parents → 主数据 link fields; children → sectioned tables (incl. 售价 on listings).
 */
export function buildUedRelatedInfo(
  module: string | undefined,
  row: UedRecord,
): DetailRelatedInfo {
  switch (module) {
    case 'master-products': {
      const spu = typeof row.spu === 'string' ? row.spu : undefined
      const product = spu
        ? ERP_DEMO_PRODUCTS.find((item) => item.spu === spu)
        : undefined
      const listings = spu ? getDemoListingsBySpu(spu) : []
      const variants = (product?.variants ?? []).map((variant) => ({
        sku: variant.code,
        color: variant.color,
        size: variant.size,
        status: variant.status,
        href: `/console/master-skus/${encodeURIComponent(variant.code)}`,
      }))

      return {
        parents: [],
        sections: [
          {
            title: 'SKU 列表',
            description: '该 SPU 下的内部 SKU（规格）',
            columns: [
              { key: 'sku', label: '内部 SKU', mono: true, hrefKey: 'href' },
              { key: 'color', label: '颜色' },
              { key: 'size', label: '尺码' },
              { key: 'status', label: '状态' },
            ],
            rows: variants,
            emptyText: '暂无 SKU',
          },
          listingsSection(listings, {
            description: '此商品各 SKU 的刊登列表（示例数据）；含售价',
          }),
        ],
      }
    }

    case 'master-skus': {
      const sku =
        (typeof row.sku === 'string' && row.sku) ||
        (typeof row.id === 'string' && row.id) ||
        undefined
      return {
        parents: parentForSpu(sku),
        sections: sku ? buildSkuChildren(sku) : [],
      }
    }

    case 'supplier-skus': {
      const sku = typeof row.sku === 'string' ? row.sku : undefined
      const id = typeof row.id === 'string' ? row.id : undefined
      const supplierName = typeof row.supplier === 'string' ? row.supplier : undefined
      const supplier = supplierName ? findSupplierMasterByName(supplierName) : null
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
        ...(supplier
          ? [
              {
                label: '供应商',
                value: `${supplier.code} · ${supplier.name}`,
                href: `/console/suppliers/${encodeURIComponent(supplier.code)}`,
                mono: true,
              } satisfies DetailRelatedParent,
            ]
          : supplierName
            ? [{ label: '供应商', value: supplierName } satisfies DetailRelatedParent]
            : []),
      ]
      return {
        parents,
        sections: sku ? buildSkuChildren(sku, { excludeSupplierSkuId: id }) : [],
      }
    }

    case 'mappings': {
      const internalSku = typeof row.internalSku === 'string' ? row.internalSku : undefined
      const shop = typeof row.shop === 'string' ? row.shop : undefined
      const sellerSku = typeof row.sellerSku === 'string' ? row.sellerSku : undefined
      const sku = internalSku && internalSku !== '—' ? internalSku : undefined
      const parents: DetailRelatedParent[] = [
        ...parentForInternalSku(sku),
        ...parentForSpu(sku),
      ]

      const bySeller = shop && sellerSku ? getDemoListingsBySellerSku(shop, sellerSku) : []
      const bySku = sku ? getDemoListingsBySku(sku) : []
      const listingMap = new Map<string, DemoListing>()
      for (const item of [...bySeller, ...bySku]) listingMap.set(item.id, item)

      return {
        parents,
        sections: [
          listingsSection(Array.from(listingMap.values()), {
            description: '该映射关联的刊登（示例）；含售价',
          }),
          ...(sku
            ? buildSkuChildren(sku, { excludeSellerSku: sellerSku }).filter(
                (section) => section.title !== '刊登列表',
              )
            : []),
        ],
      }
    }

    default:
      return { parents: [], sections: [] }
  }
}

/** Primary pricing fields for SKU-centric detail pages (mock). */
export function buildPrimaryPricingFields(sku: string | undefined) {
  if (!sku) return null
  const pricing = getDemoSkuPricing(sku)
  if (!pricing) return null
  return {
    title: '主定价信息',
    description: `${pricing.source} · 生效 ${pricing.effective}`,
    fields: [
      { label: '币种', value: pricing.currency },
      { label: '成本参考', value: `${pricing.costPrice.toFixed(2)} ${pricing.currency}` },
      { label: '主定价', value: `${pricing.basePrice.toFixed(2)} ${pricing.currency}` },
      { label: '建议售价', value: `${pricing.suggestPrice.toFixed(2)} ${pricing.currency}` },
      { label: '目标毛利率', value: `${pricing.targetMarginPct}%` },
      { label: '生效日期', value: pricing.effective },
    ],
  }
}

export function resolveSkuFromRow(row: UedRecord): string | undefined {
  if (typeof row.sku === 'string' && row.sku && row.sku !== '—') return row.sku
  if (typeof row.internalSku === 'string' && row.internalSku && row.internalSku !== '—') {
    return row.internalSku
  }
  if (typeof row.id === 'string' && /^[A-Z]{2,}\d{6,}$/.test(row.id)) return row.id
  return undefined
}
