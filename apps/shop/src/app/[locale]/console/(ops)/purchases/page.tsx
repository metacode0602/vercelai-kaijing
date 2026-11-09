'use client'

/**
 * 兼容旧入口「采购管理」：与采购申请共用 tRPC 数据源。
 * 主路径请使用 /console/purchase-requests 与 /console/purchase-approvals。
 */

export { default } from '../purchase-requests/page'
