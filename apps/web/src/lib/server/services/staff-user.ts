/**
 * StaffUserService — 员工与登录账号同步编排（rbac-design.md §4.3）
 * 实现位于 staff-auth.ts；本模块为统一入口。
 */
import {
  applyAuthUserLoginGrant,
  autoLinkStaffForAuthUser,
  clearMustChangePassword,
  createAuthUserForStaff,
  ensureStaffLoginAccess,
  getLinkedAuthUser,
  getStaffDefaultPassword,
  linkStaffAuthUser,
  provisionUserAsAdmin,
  resolveStaffLoginEmail,
  searchLinkableAuthUsers,
  syncStaffAuthContact,
  unlinkStaffAuthUser,
  unlinkStaffBeforeDelete,
  type LinkedAuthUser,
} from '@/lib/server/dataaccess/crm/staff-auth'

export type { LinkedAuthUser }

export const StaffUserService = {
  getDefaultPassword: getStaffDefaultPassword,
  resolveLoginEmail: resolveStaffLoginEmail,
  createWithAccount: createAuthUserForStaff,
  provisionAccount: ensureStaffLoginAccess,
  provisionUserAsAdmin,
  applyLoginGrant: applyAuthUserLoginGrant,
  linkAccount: linkStaffAuthUser,
  unlinkAccount: unlinkStaffAuthUser,
  syncContactFields: syncStaffAuthContact,
  autoLinkOnLogin: autoLinkStaffForAuthUser,
  clearMustChangePassword,
  searchLinkableAuthUsers,
  getLinkedAuthUser,
  unlinkBeforeDelete: unlinkStaffBeforeDelete,
}
