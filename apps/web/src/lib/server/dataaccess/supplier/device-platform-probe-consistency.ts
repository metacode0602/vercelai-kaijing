import {
  PROBE_STATUS_LABELS,
  type ConsistencyFlag,
  type ProbeStatus,
  type ProxyRentStatus,
} from '@/lib/supplier/device-platform-probe-utils'

type ChannelRequirement = 'required' | 'optional' | 'none'

type OpsChannelExpectation = {
  proxy: ChannelRequirement
  k8s: ChannelRequirement
  bareMetal: ChannelRequirement
}

/** §4.4.2 ops_status 期望通道矩阵 */
const OPS_CHANNEL_MATRIX: Record<string, OpsChannelExpectation> = {
  预留闲置中: { proxy: 'none', k8s: 'none', bareMetal: 'none' },
  在集群中: { proxy: 'optional', k8s: 'required', bareMetal: 'none' },
  集群组件运行中: { proxy: 'optional', k8s: 'required', bareMetal: 'none' },
  不可调度节点运行中: { proxy: 'optional', k8s: 'required', bareMetal: 'none' },
  // 网关直连裸金属支持同时上架裸金属短租与 K8s，k8s 命中不视为异常
  网关直连裸金属上架中: { proxy: 'required', k8s: 'optional', bareMetal: 'optional' },
  单机直连裸金属上架中: { proxy: 'required', k8s: 'none', bareMetal: 'optional' },
  // 网关代理裸金属可在 K8s 与裸金属短租间切换，k8s 未命中不视为缺失
  网关代理裸金属上架中: { proxy: 'required', k8s: 'optional', bareMetal: 'optional' },
  网关节点上架中: { proxy: 'required', k8s: 'optional', bareMetal: 'none' },
  线下裸金属交付中: { proxy: 'optional', k8s: 'none', bareMetal: 'required' },
  其他部门使用中: { proxy: 'none', k8s: 'none', bareMetal: 'none' },
}

const ELASTIC_POOL_OPS = new Set([
  '在集群中',
  '集群组件运行中',
  '不可调度节点运行中',
  '网关代理裸金属上架中',
  '网关节点上架中',
])

const BARE_METAL_POOL_OPS = new Set([
  '网关直连裸金属上架中',
  '单机直连裸金属上架中',
  '网关代理裸金属上架中',
  '线下裸金属交付中',
])

const DUAL_POOL_OPS = new Set(['网关代理裸金属上架中'])

const DEFAULT_MATRIX: OpsChannelExpectation = {
  proxy: 'none',
  k8s: 'none',
  bareMetal: 'none',
}

export type ProbeConsistencyInput = {
  probeStatus: ProbeStatus
  opsStatus: string
  proxyMatched: boolean
  proxyRentStatus: ProxyRentStatus | null
  proxyIsContainerInstance: boolean | null
  k8sMatched: boolean
  bareMetalMatched: boolean
}

export type ProbeConsistencyResult = {
  consistencyFlag: ConsistencyFlag
  suggestedAction: string
  consistencyReason: string
}

function formatChannelPresence(input: {
  proxyMatched: boolean
  k8sMatched: boolean
  bareMetalMatched: boolean
}): string {
  return `接入端：${input.proxyMatched ? '有' : '无'}；K8s：${input.k8sMatched ? '有' : '无'}；裸金属：${input.bareMetalMatched ? '有' : '无'}`
}

function listMissingChannels(
  matrix: OpsChannelExpectation,
  proxyHit: boolean,
  k8sHit: boolean,
  bareMetalHit: boolean,
): string[] {
  const missing: string[] = []
  if (matrix.proxy === 'required' && !proxyHit) missing.push('接入端')
  if (matrix.k8s === 'required' && !k8sHit) missing.push('K8s')
  if (matrix.bareMetal === 'required' && !bareMetalHit) missing.push('裸金属')
  return missing
}

function listUnexpectedChannels(
  matrix: OpsChannelExpectation,
  proxyHit: boolean,
  k8sHit: boolean,
  bareMetalHit: boolean,
): string[] {
  const unexpected: string[] = []
  if (matrix.proxy === 'none' && proxyHit) unexpected.push('接入端')
  if (matrix.k8s === 'none' && k8sHit) unexpected.push('K8s')
  if (matrix.bareMetal === 'none' && bareMetalHit) unexpected.push('裸金属')
  return unexpected
}

function formatRentDisplay(
  rentStatus: ProxyRentStatus | null,
  isContainer: boolean | null,
): string {
  if (!rentStatus) return '未知'
  if (rentStatus === 'Idle') return '空闲'
  if (isContainer === true) return '弹性服务（出租中）'
  if (isContainer === false) return '裸金属（出租中）'
  return '弹性出租中（类型未知）'
}

function deriveRentConflictReason(input: ProbeConsistencyInput): string | null {
  if (!input.proxyMatched || !input.proxyRentStatus) return null
  const rent = input.proxyRentStatus
  const isContainer = input.proxyIsContainerInstance
  const rentLabel = formatRentDisplay(rent, isContainer)

  if (input.opsStatus === '预留闲置中' && rent === 'ElasticRenting') {
    return `CRM 设备状态为「预留闲置中」，但接入端显示「${rentLabel}」，主数据与租赁态不一致。`
  }

  if (
    ELASTIC_POOL_OPS.has(input.opsStatus) &&
    rent === 'ElasticRenting' &&
    isContainer === false &&
    !input.bareMetalMatched &&
    !DUAL_POOL_OPS.has(input.opsStatus)
  ) {
    return `CRM 设备状态为「${input.opsStatus}」（属弹性池），接入端为「${rentLabel}」，且无裸金属订单信号，租赁形态与池归属矛盾。`
  }

  if (
    BARE_METAL_POOL_OPS.has(input.opsStatus) &&
    rent === 'ElasticRenting' &&
    isContainer === true &&
    !input.k8sMatched &&
    !DUAL_POOL_OPS.has(input.opsStatus)
  ) {
    return `CRM 设备状态为「${input.opsStatus}」（属裸金属池），接入端为「${rentLabel}」，且无 K8s 节点信号，租赁形态与池归属矛盾。`
  }

  return null
}

export function deriveProbeStatus(input: {
  hasInternalIp: boolean
  hasDcMapping: boolean
  proxyMatched: boolean
  k8sMatched: boolean
  bareMetalMatched: boolean
  ambiguous: boolean
}): ProbeStatus {
  if (!input.hasInternalIp) return 'no_internal_ip'
  if (!input.hasDcMapping) return 'dc_unmapped'
  if (input.ambiguous) return 'ambiguous'

  const p = input.proxyMatched
  const k = input.k8sMatched
  const b = input.bareMetalMatched
  const count = [p, k, b].filter(Boolean).length

  if (count === 0) return 'platform_absent'
  if (count === 3) return 'all_matched'
  if (p && k && !b) return 'proxy_and_k8s'
  if (p && b && !k) return 'proxy_and_bare_metal'
  if (k && b && !p) return 'k8s_and_bare_metal'
  if (p && !k && !b) return 'proxy_only'
  if (k && !p && !b) return 'k8s_only'
  if (b && !p && !k) return 'bare_metal_only'
  return 'platform_absent'
}

function channelHit(matched: boolean): boolean {
  return matched
}

/** CM-5：接入端 ElasticRenting + is_container_instance=false → 裸金属（出租中） */
function isProxyBareMetalRenting(input: {
  proxyMatched: boolean
  proxyRentStatus: ProxyRentStatus | null
  proxyIsContainerInstance: boolean | null
}): boolean {
  return (
    input.proxyMatched &&
    input.proxyRentStatus === 'ElasticRenting' &&
    input.proxyIsContainerInstance === false
  )
}

function deriveNotEvaluatedResult(probeStatus: ProbeStatus): ProbeConsistencyResult {
  const reasons: Record<string, string> = {
    no_internal_ip:
      '设备主数据缺少内网 IP，无法按 IP 向接入端、K8s、裸金属发起平台匹配。',
    dc_unmapped:
      '机房未配置容器 region 或裸金属 region 映射，无法确定平台侧查询范围。',
    ambiguous:
      '同机房、同内网 IP 在平台侧存在多条记录，无法自动消歧，需人工确认。',
  }
  const actions: Record<string, string> = {
    no_internal_ip: '补充内网 IP 后重新导入设备主数据',
    dc_unmapped: '关联机房并配置容器 region / 裸金属 region',
    ambiguous: '同机房同 IP 存在多条平台记录，需人工消歧',
  }

  return {
    consistencyFlag: 'not_evaluated',
    suggestedAction: actions[probeStatus] ?? '待评估',
    consistencyReason: reasons[probeStatus] ?? '探测前置条件未满足，无法评估一致性。',
  }
}

export function deriveProbeConsistency(input: ProbeConsistencyInput): ProbeConsistencyResult {
  if (['no_internal_ip', 'dc_unmapped', 'ambiguous'].includes(input.probeStatus)) {
    return deriveNotEvaluatedResult(input.probeStatus)
  }

  const presence = formatChannelPresence(input)
  const probeLabel = PROBE_STATUS_LABELS[input.probeStatus]

  if (isProxyBareMetalRenting(input)) {
    return {
      consistencyFlag: 'consistent',
      suggestedAction: '无需处理',
      consistencyReason:
        '接入端显示裸金属出租中（ElasticRenting + is_container_instance=false），按规则视同与平台一致。' +
        `平台实测（${presence}）；probe_status：${probeLabel}。`,
    }
  }

  const matrix = OPS_CHANNEL_MATRIX[input.opsStatus] ?? DEFAULT_MATRIX
  const proxyHit = channelHit(input.proxyMatched)
  const k8sHit = channelHit(input.k8sMatched)
  const bareMetalHit = channelHit(input.bareMetalMatched)

  const missingChannels = listMissingChannels(matrix, proxyHit, k8sHit, bareMetalHit)
  if (missingChannels.length > 0) {
    return {
      consistencyFlag: 'missing_platform',
      suggestedAction: '主数据称在线但平台无对应通道信号，核对 IP / region 或平台接入',
      consistencyReason:
        `CRM 设备状态为「${input.opsStatus}」，CM-1 矩阵要求 ${missingChannels.join('、')} 必须有平台信号，但探测未命中。` +
        `平台实测（${presence}）；probe_status：${probeLabel}。`,
    }
  }

  const rentConflictReason = deriveRentConflictReason(input)
  if (rentConflictReason) {
    return {
      consistencyFlag: 'multi_channel_conflict',
      suggestedAction: '多通道租赁态与 ops 池归属矛盾，需人工核对',
      consistencyReason: `${rentConflictReason}平台实测（${presence}）；probe_status：${probeLabel}。`,
    }
  }

  if (input.opsStatus === '预留闲置中' && proxyHit && input.proxyRentStatus === 'Idle') {
    return {
      consistencyFlag: 'consistent',
      suggestedAction: '无需处理',
      consistencyReason:
        `CRM 为「预留闲置中」且接入端空闲，与主数据一致。平台实测（${presence}）；probe_status：${probeLabel}。`,
    }
  }

  const unexpectedChannels = listUnexpectedChannels(matrix, proxyHit, k8sHit, bareMetalHit)
  if (unexpectedChannels.length > 0) {
    const probeNote =
      input.probeStatus === 'all_matched'
        ? '「三路齐」仅表示三通道均有平台信号，不代表与 CRM 设备状态一致。'
        : ''
    return {
      consistencyFlag: 'unexpected_platform',
      suggestedAction: '平台有信号但主数据未体现，更新设备主数据或确认平台是否误占',
      consistencyReason:
        `CRM 设备状态为「${input.opsStatus}」，CM-1 矩阵规定 ${unexpectedChannels.join('、')} 不应有平台信号，但探测已命中。` +
        `${probeNote}平台实测（${presence}）；probe_status：${probeLabel}。`,
    }
  }

  const requirementsMet =
    (matrix.proxy !== 'required' || proxyHit) &&
    (matrix.k8s !== 'required' || k8sHit) &&
    (matrix.bareMetal !== 'required' || bareMetalHit)

  if (requirementsMet) {
    return {
      consistencyFlag: 'consistent',
      suggestedAction: '无需处理',
      consistencyReason:
        `CRM 设备状态「${input.opsStatus}」与各平台实测符合 CM-1 期望矩阵。平台实测（${presence}）；probe_status：${probeLabel}。`,
    }
  }

  return {
    consistencyFlag: 'multi_channel_conflict',
    suggestedAction: '多通道租赁态与 ops 池归属矛盾，需人工核对',
    consistencyReason:
      `CRM 设备状态为「${input.opsStatus}」，通道组合超出该状态可解释范围，需人工核对。` +
      `平台实测（${presence}）；probe_status：${probeLabel}。`,
  }
}

export function deriveConsistencyFlag(input: ProbeConsistencyInput): ConsistencyFlag {
  return deriveProbeConsistency(input).consistencyFlag
}

export function deriveOrphanProbeConsistency(input: {
  probeStatus: ProbeStatus
  proxyMatched: boolean
  k8sMatched: boolean
  bareMetalMatched: boolean
}): ProbeConsistencyResult {
  if (['no_internal_ip', 'dc_unmapped', 'ambiguous'].includes(input.probeStatus)) {
    return deriveNotEvaluatedResult(input.probeStatus)
  }

  const presence = formatChannelPresence(input)
  const probeLabel = PROBE_STATUS_LABELS[input.probeStatus]
  const channels: string[] = []
  if (input.proxyMatched) channels.push('接入端')
  if (input.k8sMatched) channels.push('K8s')
  if (input.bareMetalMatched) channels.push('裸金属')

  return {
    consistencyFlag: 'missing_crm',
    suggestedAction: deriveOrphanSuggestedAction(),
    consistencyReason:
      `${channels.join('、')} 有平台信号，但 CRM 有效库存中无对应设备（同机房同 IP 无匹配）。` +
      `平台实测（${presence}）；probe_status：${probeLabel}。`,
  }
}

export function deriveOrphanSuggestedAction(): string {
  return '平台/订单有记录但 CRM 无对应库存设备，请补主数据或确认是否应下线'
}

export function deriveSuggestedAction(input: {
  probeStatus: ProbeStatus
  consistencyFlag: ConsistencyFlag
}): string {
  if (input.probeStatus === 'no_internal_ip') return '补充内网 IP 后重新导入设备主数据'
  if (input.probeStatus === 'dc_unmapped') return '关联机房并配置容器 region / 裸金属 region'
  if (input.probeStatus === 'ambiguous') return '同机房同 IP 存在多条平台记录，需人工消歧'
  if (input.consistencyFlag === 'missing_platform') {
    return '主数据称在线但平台无对应通道信号，核对 IP / region 或平台接入'
  }
  if (input.consistencyFlag === 'unexpected_platform') {
    return '平台有信号但主数据未体现，更新设备主数据或确认平台是否误占'
  }
  if (input.consistencyFlag === 'multi_channel_conflict') {
    return '多通道租赁态与 ops 池归属矛盾，需人工核对'
  }
  if (input.consistencyFlag === 'consistent') return '无需处理'
  if (input.consistencyFlag === 'missing_crm') return deriveOrphanSuggestedAction()
  return '待评估'
}

export function isNeedsActionConsistency(flag: ConsistencyFlag): boolean {
  return ['missing_platform', 'unexpected_platform', 'multi_channel_conflict', 'missing_crm'].includes(
    flag,
  )
}
