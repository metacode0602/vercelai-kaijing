/**
 * SLA 合同卡时 — 由 supplier_contract + supplier_contract_capacity_line 计算
 * 设计依据：apps/web/content/design/sla/datacenter-sla-implementation-design.md §5.15
 */

export type ContractCapacityLineForCardHours = {
  dataCenterId: string
  gpuCardTypeId: string
  gpuQuantity: number
  startDate: string
  endDate: string
  lineStatus: string
  contractStatus: string
}

const HOURS_PER_DAY = 24

function isActiveOnDate(line: ContractCapacityLineForCardHours, statDate: string): boolean {
  if (line.lineStatus !== 'active') return false
  if (line.contractStatus !== 'active') return false
  return line.startDate <= statDate && statDate <= line.endDate
}

/** 单条产能明细在 statDate 的贡献卡时（gpu_quantity × 24） */
export function contractCapacityLineCardHoursOnDate(
  line: ContractCapacityLineForCardHours,
  statDate: string,
): number {
  if (!isActiveOnDate(line, statDate)) return 0
  return line.gpuQuantity * HOURS_PER_DAY
}

export type ContractCardHoursBucket = {
  dataCenterId: string
  gpuCardTypeId: string
  contractCardHours: number
}

/** 按机房×卡型汇总某日合同卡时 */
export function aggregateContractCardHoursByDcCard(
  lines: ContractCapacityLineForCardHours[],
  statDate: string,
): ContractCardHoursBucket[] {
  const map = new Map<string, ContractCardHoursBucket>()

  for (const line of lines) {
    const hours = contractCapacityLineCardHoursOnDate(line, statDate)
    if (hours <= 0) continue
    const key = `${line.dataCenterId}:${line.gpuCardTypeId}`
    const existing = map.get(key)
    if (existing) {
      existing.contractCardHours += hours
    } else {
      map.set(key, {
        dataCenterId: line.dataCenterId,
        gpuCardTypeId: line.gpuCardTypeId,
        contractCardHours: hours,
      })
    }
  }

  return [...map.values()]
}
