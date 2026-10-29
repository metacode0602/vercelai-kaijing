'use client'

import { createDemoStore } from '@/lib/crossborder/local-store'

export type OrganizationMember = {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: '启用' | '停用'
}

export const DEMO_MEMBERS: OrganizationMember[] = [
  { id: 'USR-0001', name: '杨洁', email: 'yangjie@example.com', role: 'owner', status: '启用' },
  { id: 'USR-0002', name: '黄发聪', email: 'huangfacong@example.com', role: 'admin', status: '启用' },
  { id: 'USR-0003', name: '李萍', email: 'liping@example.com', role: 'member', status: '启用' },
  { id: 'USR-0004', name: '张鑫德', email: 'zhangxinde@example.com', role: 'member', status: '启用' },
  { id: 'USR-0005', name: '蔡利达', email: 'cailida@example.com', role: 'member', status: '启用' },
  { id: 'USR-0006', name: '郑惠蓉', email: 'zhenghuirong@example.com', role: 'member', status: '启用' },
  { id: 'USR-0007', name: '兰雨晨', email: 'lanyuchen@example.com', role: 'member', status: '启用' },
  { id: 'USR-0008', name: '蔡值', email: 'caizhi@example.com', role: 'viewer', status: '启用' },
  { id: 'USR-0009', name: '外部 IT', email: 'it@example.com', role: 'viewer', status: '停用' },
]

const store = createDemoStore<OrganizationMember[]>('open-shop.console.demo.members.v2', DEMO_MEMBERS)

export function useMembers() {
  return store.useStore()
}

export function nextMemberId(rows: OrganizationMember[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^USR-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `USR-${String(max + 1).padStart(4, '0')}`
}

export function addMember(rows: OrganizationMember[], input: Omit<OrganizationMember, 'id'>) {
  store.set([...rows, { ...input, id: nextMemberId(rows) }])
}

export function updateMember(rows: OrganizationMember[], id: string, patch: Partial<OrganizationMember>) {
  store.set(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
}
