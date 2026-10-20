/**
 * 调度引擎类型定义
 * 与 resource-pool-optimization.md 对齐
 */

// ---------------------------------------------------------------------------
// §2.3.1 调度动作
// ---------------------------------------------------------------------------

export type SchedulingActionType =
  | "route-to-od"
  | "route-to-stable"
  | "route-to-ai"

export interface SchedulingAction {
  type: SchedulingActionType
  priorityClass: "od-high" | "od-normal" | "od-low"
  weight: number
  preemptionPenalty: number
}

// ---------------------------------------------------------------------------
// §2.3.4 匹配条件（DB 列 + JSONB 扩展）
// ---------------------------------------------------------------------------

export interface MatchCondition {
  tenantTier: string[] | null
  productLine: string[] | null
  billingMode: string[] | null
  taskCategory: string[] | null
  extra: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// §2.3.5 空闲窗口上下文
// ---------------------------------------------------------------------------

export interface IdleWindowContext {
  /** 是否命中全局空闲窗口（来自 idc_capacity_window） */
  hitGlobal: boolean
  /** 是否命中区域空闲窗口 */
  hitRegion: boolean
  /** 当前时段可用容量（来自 idc_capacity_window） */
  capacitySlot: number | null
  /** IDC 空闲窗口记录 ID */
  idcCapacityWindowId: string | null
}

// ---------------------------------------------------------------------------
// §2.3.6 级联调度
// ---------------------------------------------------------------------------

export interface CascadeDecision {
  tier: string
  action: SchedulingAction
  fallback: SchedulingAction | null
}

// ---------------------------------------------------------------------------
// §2.3.2 规则评估上下文
// ---------------------------------------------------------------------------

export interface RuleMatchContext {
  tenantId: string
  tenantTier: string | null
  productLine: string | null
  billingMode: string | null
  taskCategory: string | null
  idleWindow: IdleWindowContext
}

// ---------------------------------------------------------------------------
// §2.3.5 规则评估结果
// ---------------------------------------------------------------------------

export interface RuleEvaluation {
  ruleId: string
  ruleName: string
  action: SchedulingAction
  priorityScore: number
  matched: boolean
}

// ---------------------------------------------------------------------------
// §2.6 设备快照（运营看板用，非用户侧）
// ---------------------------------------------------------------------------

export interface DeviceSnapshotItem {
  supplierDeviceId: string
  dataCenterId: string
  gpuCardTypeId: string
  gpuCount: number
  pool: "od" | "stable" | "ai"
  allocatedTo: string | null
  allocatedGpuCount: number
  allocatableGpuCount: number
  currentPriorityClass: string
  currentWeight: number
  preemptible: boolean
  snapshotAt: Date
}

// ---------------------------------------------------------------------------
// §B.3.1 规则冲突检测
// ---------------------------------------------------------------------------

export interface RuleConflictDetection {
  conflict: boolean
  conflictingRuleIds: string[]
  reason: string | null
}
