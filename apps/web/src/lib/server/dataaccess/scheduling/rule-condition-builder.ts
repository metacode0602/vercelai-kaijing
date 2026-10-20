/**
 * §2.3.5 空闲窗口条件构建器
 * 用于 JSONB match_extra 中 idle_window 相关字段的匹配
 */

import { sql } from "drizzle-orm"
import type { IdleWindowContext } from "./types"

/**
 * 根据规则 match_extra 中的 idle_window 配置，
 * 构建与当前 idleWindow 上下文的匹配条件
 *
 * match_extra 示例：
 * {
 *   "idle_window_hit_global": true,
 *   "idle_window_hit_region": false,
 *   "capacity_slot_min": 4
 * }
 */
export function buildIdleWindowCondition(
  matchExtra: Record<string, unknown>,
  idleWindow: IdleWindowContext,
): boolean {
  // idle_window_hit_global 通配或匹配
  if (typeof matchExtra.idle_window_hit_global === "boolean") {
    if (matchExtra.idle_window_hit_global !== idleWindow.hitGlobal) return false
  }

  // idle_window_hit_region 通配或匹配
  if (typeof matchExtra.idle_window_hit_region === "boolean") {
    if (matchExtra.idle_window_hit_region !== idleWindow.hitRegion) return false
  }

  // capacity_slot_min: 当前容量 >= 指定值
  if (typeof matchExtra.capacity_slot_min === "number") {
    if (
      idleWindow.capacitySlot === null ||
      idleWindow.capacitySlot < matchExtra.capacity_slot_min
    )
      return false
  }

  return true
}
