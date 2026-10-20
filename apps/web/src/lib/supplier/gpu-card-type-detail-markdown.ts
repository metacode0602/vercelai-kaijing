import { manufacturerNames } from '@/lib/data/types'
import type {
  GpuCardTypeDatacenterDetailData,
  GpuCardTypeDetailPageData,
} from '@/lib/server/dataaccess/supplier/gpu-card-types'

const CARD_HOUR_PRODUCT_LINES = new Set([
  'elastic_service',
  'cloud_vm',
  'job',
  'spot',
])

const dcStatusNames: Record<string, string> = {
  online: '在线',
  offline: '离线',
  maintenance: '维护中',
}

const deviceRoleLabels: Record<string, string> = {
  compute: 'GPU',
  infra: 'CPU',
  wr_placeholder: '整租占位',
}

function formatPrice(value: number | null | undefined): string {
  return value != null ? `¥${value.toFixed(2)}` : '未配置'
}

function heading(level: number, base: number): string {
  return '#'.repeat(base + level - 1)
}

function formatLines(
  title: string,
  lines: string[],
  emptyText: string,
  titleHeading: string,
): string {
  const body =
    lines.length > 0
      ? lines.map((line) => `- ${line}`).join('\n')
      : `- ${emptyText}`
  return `${titleHeading} ${title}\n\n${body}`
}

function formatDatacenterDetailSection(
  dc: GpuCardTypeDatacenterDetailData,
  baseHeading = 1,
): string {
  const h1 = heading(1, baseHeading)
  const h2 = heading(2, baseHeading)
  const h3 = heading(3, baseHeading)
  const sections: string[] = [
    `${h1} ${dc.dataCenterName}`,
    '',
    `- 供应商：${dc.supplierName}`,
    `- 卡型：${dc.cardTypeName}`,
    '',
    `${h2} 设备配置（机房 × 卡型）`,
    '',
  ]

  if (dc.deviceSpec.hasAny) {
    sections.push(...dc.deviceSpec.lines.map((line) => `- ${line}`))
    if (dc.deviceSpec.remark?.trim()) {
      sections.push('', `- 备注：${dc.deviceSpec.remark.trim()}`)
    }
  } else {
    sections.push('- 尚未维护设备配置')
  }

  sections.push('', `${h2} 机房基础设施`, '')

  if (dc.infrastructure.hasAny) {
    sections.push(
      formatLines('带宽', dc.infrastructure.bandwidthLines, '尚未配置带宽', h3),
      '',
      formatLines('网络', dc.infrastructure.networkLines, '尚未配置网络', h3),
      '',
      formatLines('存储', dc.infrastructure.storageLines, '尚未配置存储', h3),
    )
  } else {
    sections.push('- 尚未维护机房基础设施')
  }

  sections.push('', `${h2} 卡时价`, '', '| 产品线 | 销售单价 | 价格来源 |', '| --- | --- | --- |')
  for (const row of dc.cardHourPrices) {
    sections.push(
      `| ${row.productLineLabel} | ${formatPrice(row.sellPrice)} | ${row.sourceLabel} |`,
    )
  }

  sections.push('', `${h2} 裸金属定价`, '', '| 租期 | 销售单价 | 价格来源 |', '| --- | --- | --- |')
  for (const row of dc.bareMetalPrices) {
    sections.push(
      `| ${row.billingUnitLabel} | ${formatPrice(row.sellPrice)} | ${row.sourceLabel} |`,
    )
  }

  return sections.join('\n')
}

export function buildGpuCardTypeDatacenterDetailMarkdown(
  dc: GpuCardTypeDatacenterDetailData,
): string {
  return formatDatacenterDetailSection(dc).trim()
}

export function buildGpuCardTypeDetailMarkdown(
  detail: GpuCardTypeDetailPageData,
  datacenterDetails: GpuCardTypeDatacenterDetailData[] = [],
): string {
  const { card, listPrices, datacenters } = detail
  const cardHourListPrices = listPrices.filter(
    (row) => CARD_HOUR_PRODUCT_LINES.has(row.productLine) && row.billingUnit === 'hour',
  )
  const bareMetalListPrices = listPrices.filter((row) => row.productLine === 'bare_metal')
  const unitLabel = card.deviceRole === 'infra' ? '台' : '卡'
  const roleLabel = deviceRoleLabels[card.deviceRole ?? 'compute'] ?? 'GPU'
  const manufacturer = manufacturerNames[card.manufacturer] ?? card.manufacturer

  const lines: string[] = [
    `# ${card.name}`,
    '',
    `- 编码：${card.code ?? card.id}`,
    `- 类型：${roleLabel}`,
    `- 状态：${card.status === 'active' ? '启用' : '已禁用'}`,
    `- 厂商：${manufacturer}`,
    `- 显存：${card.memoryGB} GB`,
  ]

  if (card.tdpWatts != null) {
    lines.push(`- TDP：${card.tdpWatts} W`)
  }
  if (card.computeCapability) {
    lines.push(`- 算力：${card.computeCapability}`)
  }

  lines.push('', '## 当前生效平台刊例价', '', '### 卡时价', '', '| 产品线 | 计费单位 | 销售单价 | 状态 |', '| --- | --- | --- | --- |')
  for (const row of cardHourListPrices) {
    const status =
      row.status === 'active' ? '生效中' : row.sellPrice != null ? row.status ?? '—' : '—'
    lines.push(
      `| ${row.productLineLabel} | ${row.billingUnitLabel} | ${formatPrice(row.sellPrice)} | ${status} |`,
    )
  }

  lines.push('', '### 裸金属', '', '| 租期 | 销售单价 | 状态 |', '| --- | --- | --- |')
  for (const row of bareMetalListPrices) {
    const status =
      row.status === 'active' ? '生效中' : row.sellPrice != null ? row.status ?? '—' : '—'
    lines.push(
      `| ${row.billingUnitLabel} | ${formatPrice(row.sellPrice)} | ${status} |`,
    )
  }

  lines.push('', '## 机房列表', '')
  if (datacenters.length === 0) {
    lines.push('暂无库存大于 0 的机房')
  } else {
    lines.push(
      `| 机房 | 供应商 | 位置 | 状态 | 设备数（${unitLabel}） | 可用数（${unitLabel}） |`,
      '| --- | --- | --- | --- | --- | --- |',
    )
    for (const dc of datacenters) {
      lines.push(
        `| ${dc.dataCenterName} | ${dc.supplierName} | ${dc.location || '—'} | ${dcStatusNames[dc.dcStatus] ?? dc.dcStatus} | ${dc.deviceCount} | ${dc.availableCount} |`,
      )
    }
  }

  if (datacenterDetails.length > 0) {
    lines.push('', '## 机房详情', '')
    for (const dcDetail of datacenterDetails) {
      lines.push(formatDatacenterDetailSection(dcDetail, 3), '')
    }
  }

  return lines.join('\n').trim()
}
