'use client'

import { createDemoStore } from '@/lib/crossborder/local-store'

export type ImportTemplate = {
  id: string
  kind: string
  version: string
  fields: string
  duplicateStrategy: string
  rollbackStrategy: string
  status: '启用' | '停用'
  updatedAt: string
  note: string
}

export const DEMO_IMPORT_TEMPLATES: ImportTemplate[] = [
  { id: 'TPL-0001', kind: '仓库 / 库位', version: 'v2026-10', fields: '仓库编码, 库位编码, 库区, 绑定 SKU, 状态', duplicateStrategy: '阻止冲突行', rollbackStrategy: '允许回滚', status: '启用', updatedAt: '2026-10-20', note: '' },
  { id: 'TPL-0002', kind: '商品 / SKU', version: 'v2026-10', fields: 'SPU, SKU, 颜色, 尺码, 包装, 重量', duplicateStrategy: '仅更新允许字段', rollbackStrategy: '允许回滚', status: '启用', updatedAt: '2026-10-20', note: '' },
  { id: 'TPL-0003', kind: 'Seller SKU 映射', version: 'v2026-10', fields: '店铺, Seller SKU, 内部 SKU, 状态', duplicateStrategy: '阻止冲突行', rollbackStrategy: '允许回滚', status: '启用', updatedAt: '2026-10-20', note: '' },
  { id: 'TPL-0004', kind: '期初库存', version: 'v2026-10', fields: '仓库, 库位, 内部 SKU, 数量, 成本', duplicateStrategy: '阻止冲突行', rollbackStrategy: '仅补偿', status: '启用', updatedAt: '2026-10-18', note: '导入后生成库存流水' },
  { id: 'TPL-0005', kind: '历史订单', version: 'v2026-09', fields: '订单号, 店铺, 站点, 金额, 状态', duplicateStrategy: '阻止冲突行', rollbackStrategy: '仅补偿', status: '停用', updatedAt: '2026-09-30', note: '历史版本，仅供旧批次回看' },
]

const store = createDemoStore<ImportTemplate[]>('open-shop.console.demo.import-templates.v1', DEMO_IMPORT_TEMPLATES)

export function useImportTemplates() {
  return store.useStore()
}

export function nextTemplateId(rows: ImportTemplate[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^TPL-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `TPL-${String(max + 1).padStart(4, '0')}`
}

export function addImportTemplate(rows: ImportTemplate[], input: Omit<ImportTemplate, 'id'>) {
  store.set([{ ...input, id: nextTemplateId(rows) }, ...rows])
}

export function updateImportTemplate(rows: ImportTemplate[], id: string, patch: Partial<ImportTemplate>) {
  store.set(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
}
