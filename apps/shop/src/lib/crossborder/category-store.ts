'use client'

import { createDemoStore } from '@/lib/crossborder/local-store'

export type CategoryNode = {
  id: string
  code: string
  name: string
  parentId: string | null
  sort: number
  status: '启用' | '停用'
  note: string
  coverImage?: string
  screenshots?: string[]
}

export const DEMO_CATEGORIES: CategoryNode[] = [
  { id: 'CAT-0001', code: 'APPAREL', name: '服装', parentId: null, sort: 10, status: '启用', note: '服装一级类目' },
  { id: 'CAT-0002', code: 'APPAREL-TOPS', name: '上衣', parentId: 'CAT-0001', sort: 10, status: '启用', note: '' },
  { id: 'CAT-0003', code: 'APPAREL-TOPS-TEE', name: 'T恤', parentId: 'CAT-0002', sort: 10, status: '启用', note: '' },
  { id: 'CAT-0004', code: 'APPAREL-BOTTOMS', name: '下装', parentId: 'CAT-0001', sort: 20, status: '启用', note: '' },
  { id: 'CAT-0005', code: 'HOME', name: '家居', parentId: null, sort: 20, status: '启用', note: '家居一级类目' },
  { id: 'CAT-0006', code: 'HOME-STORAGE', name: '收纳', parentId: 'CAT-0005', sort: 10, status: '启用', note: '' },
  { id: 'CAT-0007', code: 'HOME-KITCHEN', name: '厨房', parentId: 'CAT-0005', sort: 20, status: '启用', note: '' },
  { id: 'CAT-0008', code: 'ACCESSORY', name: '配饰', parentId: null, sort: 30, status: '启用', note: '' },
  { id: 'CAT-0009', code: 'DIGITAL', name: '数码/电脑配件', parentId: null, sort: 40, status: '启用', note: '' },
  { id: 'CAT-0010', code: 'DIGITAL-PHONE', name: '手机配件', parentId: 'CAT-0009', sort: 10, status: '启用', note: '' },
  { id: 'CAT-0011', code: 'DIGITAL-COMPUTER', name: '电脑配件', parentId: 'CAT-0009', sort: 20, status: '启用', note: '' },
  { id: 'CAT-0012', code: 'BEAUTY', name: '美妆个护', parentId: null, sort: 50, status: '启用', note: '' },
  { id: 'CAT-0013', code: 'OUTDOOR', name: '户外运动', parentId: null, sort: 60, status: '启用', note: '' },
]

const store = createDemoStore<CategoryNode[]>('open-shop.console.demo.categories.v1', DEMO_CATEGORIES)

export function useCategories() {
  return store.useStore()
}

export function nextCategoryId(rows: CategoryNode[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^CAT-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `CAT-${String(max + 1).padStart(4, '0')}`
}

export function addCategory(rows: CategoryNode[], input: Omit<CategoryNode, 'id'>) {
  store.set([...rows, { ...input, id: nextCategoryId(rows) }])
}

export function updateCategory(rows: CategoryNode[], id: string, patch: Partial<CategoryNode>) {
  store.set(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
}

export function categoryDepth(rows: CategoryNode[], node: CategoryNode) {
  let depth = 0
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = rows.find((row) => row.id === parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId
  }
  return depth
}

export function categoryPath(rows: CategoryNode[], node: CategoryNode) {
  const parts: string[] = [node.name]
  let parentId = node.parentId
  const seen = new Set<string>([node.id])
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = rows.find((row) => row.id === parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join(' / ')
}

export function activeCategoryPaths(rows: CategoryNode[]) {
  const active = rows.filter((row) => row.status === '启用')
  return active
    .filter((row) => !active.some((child) => child.parentId === row.id))
    .map((row) => categoryPath(rows, row))
}
