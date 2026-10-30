'use client'

import * as React from 'react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { DEMO_FREIGHT_ESTIMATES } from '@/lib/crossborder/finance-related-data'

type ScenarioKey = 'air_ddp' | 'sea_lcl' | 'sea_fcl'

const SCENARIOS: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'air_ddp', label: '空运 DDP' },
  { key: 'sea_lcl', label: '海运拼箱 LCL' },
  { key: 'sea_fcl', label: '海运整柜 FCL' },
]

type Quote = {
  carrier: string
  lane: string
  type: string
  unit: string
  price: string
  transit: string
  hsRate: string
  validUntil: string
}

const DEMO_QUOTES: Record<ScenarioKey, Quote[]> = {
  air_ddp: [
    { carrier: '顺丰国际', lane: 'CN-XMN → LK-CMB', type: '即期报价', unit: '按 kg', price: 'USD 4.85 / kg', transit: '5-7 天', hsRate: '手机壳 HS 3926.90 · 15%', validUntil: '2026-11-15' },
    { carrier: 'DHL', lane: 'CN-XMN → LK-CMB', type: '牌价', unit: '按 kg', price: 'USD 5.20 / kg', transit: '4-6 天', hsRate: '手机壳 HS 3926.90 · 15%', validUntil: '2026-11-30' },
  ],
  sea_lcl: [
    { carrier: '中外运', lane: 'CN-XMN → LK-CMB', type: '即期报价', unit: '按 m³', price: 'USD 86 / m³', transit: '12-16 天', hsRate: '按整批 HS 归类', validUntil: '2026-11-20' },
    { carrier: '海丰', lane: 'CN-XMN → LK-CMB', type: '牌价', unit: '按 m³', price: 'USD 92 / m³', transit: '14-18 天', hsRate: '按整批 HS 归类', validUntil: '2026-11-30' },
  ],
  sea_fcl: [
    { carrier: '马士基', lane: 'CN-XMN → LK-CMB', type: '牌价', unit: '按柜型', price: 'USD 780 / 20GP', transit: '10-14 天', hsRate: '按整批 HS 归类', validUntil: '2026-11-30' },
    { carrier: '中远海运', lane: 'CN-XMN → LK-CMB', type: '即期报价', unit: '按柜型', price: 'USD 735 / 20GP', transit: '11-15 天', hsRate: '按整批 HS 归类', validUntil: '2026-11-18' },
  ],
}

export default function FreightPage() {
  const [scenario, setScenario] = React.useState<ScenarioKey>('air_ddp')
  const [weight, setWeight] = React.useState('120')
  const [volume, setVolume] = React.useState('0.8')
  const [declared, setDeclared] = React.useState('450')
  const [result, setResult] = React.useState<{ freight: number; duty: number; ddp: number; fx: string } | null>(null)
  const [notice, setNotice] = React.useState('')

  const quotes = DEMO_QUOTES[scenario]

  function estimate() {
    const w = Number(weight) || 0
    const v = Number(volume) || 0
    const value = Number(declared) || 0
    const base = scenario === 'air_ddp' ? w * 4.85 : scenario === 'sea_lcl' ? v * 86 : 735
    const duty = value * 0.15
    setResult({
      freight: Math.round(base * 100) / 100,
      duty: Math.round(duty * 100) / 100,
      ddp: Math.round((base + duty) * 100) / 100,
      fx: 'USD/CNY 7.12（快照 2026-10-29）',
    })
    setNotice('估算已按当前输入重算（原型公式）；正式结果使用 freight_estimates 快照并记录采纳时点。')
  }

  return (
    <section className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">运费测算</h1>
          <p className="mt-1 text-sm text-muted-foreground">按情景（空运 DDP / 海运拼箱 / 海运整柜）比较报价与牌价，匹配 HS 税率后采纳估算快照。</p>
        </div>
        <div className="flex items-center gap-2"><Badge variant="outline">示例数据</Badge><Button variant="outline" size="sm" asChild><LocaleLink href="/console/carriers">管理承运商</LocaleLink></Button></div>
      </header>

      <UedPrototypeNotice>
        参考数据（承运商、线路、HS 税率、箱规）中平台参考数据由平台运营维护；即期报价与牌价分开比较，采纳后生成 freight_estimates 快照，历史快照不被覆盖。关税按申报货值与匹配税率估算，清关实缴以税单为准。
      </UedPrototypeNotice>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">估算快照（示例）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>测算单</TableHead>
                <TableHead>情景</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead>运费 USD</TableHead>
                <TableHead>DDP USD</TableHead>
                <TableHead>承运商</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_FREIGHT_ESTIMATES.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink href={`/console/freight/${encodeURIComponent(item.id)}`} className="underline-offset-2 hover:underline">
                      {item.id}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{item.scenario}</TableCell>
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell className="tabular-nums">{item.freightUsd}</TableCell>
                  <TableCell className="tabular-nums">{item.ddpUsd}</TableCell>
                  <TableCell>
                    <LocaleLink href={`/console/carriers/${encodeURIComponent(item.adoptedCarrierCode)}`} className="underline-offset-2 hover:underline">
                      {item.adoptedCarrier}
                    </LocaleLink>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{item.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>


      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((item) => (
          <Button key={item.key} size="sm" variant={scenario === item.key ? 'secondary' : 'outline'} onClick={() => { setScenario(item.key); setResult(null) }}>{item.label}</Button>
        ))}
      </div>

      <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end">
        <div className="flex flex-col gap-2">
          <Label>重量（kg）</Label>
          <Input type="number" value={weight} onChange={(event) => setWeight(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>体积（m³）</Label>
          <Input type="number" value={volume} onChange={(event) => setVolume(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>申报货值（USD）</Label>
          <Input type="number" value={declared} onChange={(event) => setDeclared(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>目的国 / HS 归类</Label>
          <NativeSelect defaultValue="lk">
            <NativeSelectOption value="lk">斯里兰卡 · HS 3926.90</NativeSelectOption>
            <NativeSelectOption value="my">马来西亚 · HS 3926.90</NativeSelectOption>
            <NativeSelectOption value="th">泰国 · HS 3926.90</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button onClick={estimate}>重新测算</Button>
      </div>

      {result ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">运费估算</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-semibold tabular-nums">USD {result.freight.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">关税估算（15%）</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-semibold tabular-nums">USD {result.duty.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">DDP 总计</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-semibold tabular-nums">USD {result.ddp.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{result.fx}</p></CardContent>
          </Card>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
          <div>
            <h2 className="font-medium">报价比较 · {SCENARIOS.find((item) => item.key === scenario)?.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">即期报价与牌价并列；采纳后生成估算快照。</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>承运商</TableHead>
              <TableHead>线路</TableHead>
              <TableHead>报价类型</TableHead>
              <TableHead>计价方式</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>时效</TableHead>
              <TableHead>HS 税率</TableHead>
              <TableHead>有效期至</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((quote) => (
              <TableRow key={`${quote.carrier}-${quote.type}`}>
                <TableCell className="font-medium">{quote.carrier}</TableCell>
                <TableCell>{quote.lane}</TableCell>
                <TableCell><Badge variant={quote.type === '即期报价' ? 'secondary' : 'outline'}>{quote.type}</Badge></TableCell>
                <TableCell>{quote.unit}</TableCell>
                <TableCell className="tabular-nums">{quote.price}</TableCell>
                <TableCell>{quote.transit}</TableCell>
                <TableCell>{quote.hsRate}</TableCell>
                <TableCell>{quote.validUntil}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setNotice(`已采纳 ${quote.carrier} · ${quote.price} 生成估算快照（原型）；快照进入 freight_estimates 历史。`)}>采纳</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setNotice('HS 税率维护（平台参考数据）：3926.90 手机壳 · LK 15% · MY 0%（示例）。')}>维护 HS 税率</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('承运商与线路维护：顺丰国际 / DHL / 中外运 · CN-XMN → LK-CMB（示例）。')}>维护承运商 / 线路</Button>
        <Button variant="outline" size="sm" asChild><LocaleLink href="/console/carton-specs">维护箱规</LocaleLink></Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('已导出当前情景报价（原型动作，无文件下载）。')}>导出报价比较</Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </section>
  )
}
