'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'

export default function HsTariffsPage() {
  const [q, setQ] = React.useState('')
  const [countryCode, setCountryCode] = React.useState('LK')
  const [hsCode, setHsCode] = React.useState('')
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10))
  const [gdRate, setGdRate] = React.useState('0.15')
  const [palRate, setPalRate] = React.useState('0.05')
  const [vatRate, setVatRate] = React.useState('0.18')
  const [ssclRate, setSsclRate] = React.useState('0.025')
  const listQuery = trpc.hsTariffs.list.useQuery({ page: 1, pageSize: 50, q: q || undefined, countryCode })
  const utils = trpc.useUtils()
  const createMutation = trpc.hsTariffs.createDraft.useMutation({
    onSuccess: async () => {
      toast.success('已创建税则草稿（仅本组织，不会推送到其他租户）')
      await utils.hsTariffs.list.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })
  const statusMutation = trpc.hsTariffs.setStatus.useMutation({
    onSuccess: async () => {
      toast.success('已更新税则状态')
      await utils.hsTariffs.list.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">HS 税则</h2>
        <p className="text-sm text-muted-foreground">
          与 SLSI 合规清单分轨。税率按 HS + 目的国 + 版本维护，不写进商品行。已发布版本不可直接改，请新建版本。不把讲义静态税则库写进代码，也不会自动同步到其他租户。
        </p>
      </div>
      <p className="text-sm">
        <LocaleLink href="/console/costs/calculator" className="underline">返回定价计算器</LocaleLink>
        {' · '}
        <LocaleLink href="/console/compliance-hs-slsi" className="underline">HS/SLSI 合规清单</LocaleLink>
      </p>
      <div className="flex flex-wrap gap-2">
        <Input className="w-40" placeholder="搜索 HS" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input className="w-24" placeholder="国家" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
      </div>
      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="text-sm font-medium">新建本组织草稿</h3>
        <div className="flex flex-wrap gap-2">
          <Input className="w-40" placeholder="HS，如 8507.60.90" value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
          <Input className="w-36" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          <Input className="w-24" placeholder="GD 率" value={gdRate} onChange={(e) => setGdRate(e.target.value)} />
          <Input className="w-24" placeholder="PAL 率" value={palRate} onChange={(e) => setPalRate(e.target.value)} />
          <Input className="w-24" placeholder="VAT 率" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          <Input className="w-24" placeholder="SSCL 率" value={ssclRate} onChange={(e) => setSsclRate(e.target.value)} />
          <Button
            size="sm"
            disabled={createMutation.isPending || !hsCode.trim()}
            onClick={() =>
              createMutation.mutate({
                countryCode,
                hsCode,
                effectiveFrom,
                gdRate: Number(gdRate) || 0,
                palRate: Number(palRate) || 0,
                vatRate: Number(vatRate) || 0,
                ssclRate: Number(ssclRate) || 0,
                cessRate: 0,
                surchargeRate: 0,
                exciseRate: 0,
                isExact: true,
              })
            }
          >
            创建草稿
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">税率填写小数，如 15% 请填 0.15。创建后需手动发布才会被计算器使用。</p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HS</TableHead>
              <TableHead>国家</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>范围</TableHead>
              <TableHead>GD / PAL / VAT / SSCL</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listQuery.data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">暂无税则。请先为本组织创建草稿并发布。</TableCell>
              </TableRow>
            ) : (
              (listQuery.data?.items ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.hsCode}{row.isExact ? '' : ' · 近似'}</TableCell>
                  <TableCell>{row.countryCode}</TableCell>
                  <TableCell>v{row.version}</TableCell>
                  <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
                  <TableCell>{row.scope === 'global' ? '平台' : '本组织'}</TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {row.gdRate ?? '—'} / {row.palRate ?? '—'} / {row.vatRate ?? '—'} / {row.ssclRate ?? '—'}
                  </TableCell>
                  <TableCell className="space-x-2">
                    {row.scope !== 'global' && row.status === 'draft' ? (
                      <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: row.id, status: 'active' })}>发布</Button>
                    ) : null}
                    {row.scope !== 'global' && row.status === 'active' ? (
                      <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: row.id, status: 'archived' })}>归档</Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
