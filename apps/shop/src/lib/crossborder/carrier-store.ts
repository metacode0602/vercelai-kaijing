'use client'

import { createDemoStore } from '@/lib/crossborder/local-store'

export type Carrier = {
  code: string
  name: string
  type: '国际快递' | '海运' | '平台物流' | '尾程派送'
  coverage: string
  contact: string
  phone: string
  status: '启用' | '停用'
  note: string
}

export const DEMO_CARRIERS: Carrier[] = [
  { code: 'CAR-SF', name: '顺丰国际', type: '国际快递', coverage: 'CN → LK / MY / TH', contact: '陈经理', phone: '138-0000-1001', status: '启用', note: '空运 DDP 即期报价' },
  { code: 'CAR-DHL', name: 'DHL', type: '国际快递', coverage: '全球', contact: 'Global Desk', phone: '+65-0000-1002', status: '启用', note: '牌价参考' },
  { code: 'CAR-SINOTRANS', name: '中外运', type: '海运', coverage: 'CN → LK / MY', contact: '林经理', phone: '138-0000-1003', status: '启用', note: '海运拼箱 LCL' },
  { code: 'CAR-SITC', name: '海丰', type: '海运', coverage: 'CN → LK / MY / TH', contact: '黄经理', phone: '138-0000-1004', status: '启用', note: '海运拼箱 LCL' },
  { code: 'CAR-MAERSK', name: '马士基', type: '海运', coverage: '全球', contact: 'Trade Desk', phone: '+65-0000-1005', status: '启用', note: '海运整柜 FCL' },
  { code: 'CAR-COSCO', name: '中远海运', type: '海运', coverage: '全球', contact: '周经理', phone: '138-0000-1006', status: '启用', note: '海运整柜 FCL' },
  { code: 'CAR-DARAZ', name: 'Daraz Express', type: '平台物流', coverage: 'LK', contact: 'Daraz LK', phone: '—', status: '启用', note: 'Daraz 官方物流' },
  { code: 'CAR-LGS', name: 'LGS', type: '平台物流', coverage: 'MY / PH / SG / VN', contact: 'Lazada LGS', phone: '—', status: '启用', note: 'Lazada 官方物流' },
  { code: 'CAR-JSB', name: 'JSB', type: '平台物流', coverage: 'TH', contact: 'JSB TH', phone: '—', status: '启用', note: '泰国灰清专线' },
]

const store = createDemoStore<Carrier[]>('open-shop.console.demo.carriers.v1', DEMO_CARRIERS)

export function useCarriers() {
  return store.useStore()
}

export function nextCarrierCode(rows: Carrier[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^CAR-(\d+)$/.exec(row.code)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `CAR-${String(max + 1).padStart(4, '0')}`
}

export function addCarrier(rows: Carrier[], input: Omit<Carrier, 'code'>) {
  store.set([...rows, { ...input, code: nextCarrierCode(rows) }])
}

export function updateCarrier(rows: Carrier[], code: string, patch: Partial<Carrier>) {
  store.set(rows.map((row) => (row.code === code ? { ...row, ...patch } : row)))
}
