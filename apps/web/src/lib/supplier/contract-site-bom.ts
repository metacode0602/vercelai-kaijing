/**
 * 合同站点 BOM（GW-P0）辅助：分档、产品线、公网 IP、Excel 清单生成
 * 对齐 idle-compute-gateway-network.md §GW-P0 / §12.6
 */

export const SITE_NODE_TIERS = [
  { value: 'lte_5', label: '≤5 台', maxNodes: 5 },
  { value: 'lte_30', label: '≤30 台', maxNodes: 30 },
  { value: 'lte_100', label: '≤100 台', maxNodes: 100 },
  { value: 'gt_100', label: '100 台以上', maxNodes: null },
] as const

export type SiteNodeTier = (typeof SITE_NODE_TIERS)[number]['value']

export const PRODUCT_LINE_OPTIONS = [
  { value: 'bare_metal', label: '裸金属' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'k8s', label: 'K8s' },
  { value: 'serverless', label: 'Serverless' },
  { value: 'heavy_file', label: '重度文件' },
] as const

export type ProductLine = (typeof PRODUCT_LINE_OPTIONS)[number]['value']

export type SiteBomInput = {
  siteNodeTier?: SiteNodeTier | null
  siteNodeCount?: number | null
  productLines?: string[] | null
  publicIpCount?: number | null
  supplierProvidesCpuHosts?: boolean | null
  contractNo?: string | null
  supplierName?: string | null
}

export type SiteBomRow = {
  category: string
  item: string
  quantity: string
  owner: string
  note: string
}

function tierLabel(tier?: string | null): string {
  return SITE_NODE_TIERS.find((t) => t.value === tier)?.label ?? (tier || '未设定')
}

function productLineLabels(lines?: string[] | null): string {
  if (!lines?.length) return '未设定'
  const map = Object.fromEntries(PRODUCT_LINE_OPTIONS.map((p) => [p.value, p.label]))
  return lines.map((l) => map[l] ?? l).join('、')
}

/** 按站点规模 + 是否自带 CPU 主机，生成 BOM 预览行（设计 §12.6 最小集） */
export function buildSiteBomRows(input: SiteBomInput): SiteBomRow[] {
  const providesCpu = input.supplierProvidesCpuHosts !== false
  const ipCount = input.publicIpCount && input.publicIpCount > 0 ? input.publicIpCount : 3
  const lines = input.productLines ?? []
  const needsHeavyCache = lines.includes('heavy_file') || lines.includes('serverless')

  const controlHostQty =
    input.siteNodeTier === 'gt_100' || (input.siteNodeCount ?? 0) > 100
      ? '3'
      : input.siteNodeTier === 'lte_100' || (input.siteNodeCount ?? 0) > 30
        ? '2'
        : '1'

  const rows: SiteBomRow[] = [
    {
      category: '规模',
      item: '纳管设备规模分档',
      quantity: tierLabel(input.siteNodeTier),
      owner: '合同',
      note: input.siteNodeCount ? `精确台数 ${input.siteNodeCount}` : '',
    },
    {
      category: '规模',
      item: '产品线',
      quantity: productLineLabels(lines),
      owner: '合同',
      note: '',
    },
    {
      category: '网络',
      item: '公网 IP',
      quantity: String(ipCount),
      owner: '供应商',
      note: '最低 3、推荐 5',
    },
    {
      category: '控制面',
      item: 'CPU 控制主机',
      quantity: controlHostQty,
      owner: providesCpu ? '供应商' : '平台',
      note: providesCpu ? '供应商提供 CPU 主机' : '平台全自带模式（物流协调）',
    },
    {
      category: '控制面',
      item: 'SSH / HTTP Gateway',
      quantity: '1 套',
      owner: '平台',
      note: '平台侧部署与激活（GW-P2）',
    },
  ]

  if (needsHeavyCache) {
    rows.push({
      category: '数据面',
      item: '对象存储 Proxy / 镜像缓存',
      quantity: '按站点',
      owner: providesCpu ? '混部可选' : '平台',
      note: 'Serverless / 重度文件建议启用（GW-P4）',
    })
  }

  return rows
}

/** 浏览器端生成并下载站点 BOM xlsx（依赖 xlsx） */
export async function downloadSiteBomXlsx(input: SiteBomInput): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = buildSiteBomRows(input)
  const sheetData = [
    ['合同编号', input.contractNo ?? ''],
    ['供应商', input.supplierName ?? ''],
    [],
    ['分类', '清单项', '数量/规格', '责任方', '备注'],
    ...rows.map((r) => [r.category, r.item, r.quantity, r.owner, r.note]),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  XLSX.utils.book_append_sheet(wb, ws, '站点BOM')
  const fileName = `site-bom-${input.contractNo || 'draft'}.xlsx`
  XLSX.writeFile(wb, fileName)
}
