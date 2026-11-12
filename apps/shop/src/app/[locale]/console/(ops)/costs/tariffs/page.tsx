'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import {
  currencyForCountry,
  defaultFormulaForCountry,
  formulasForCountry,
  getFormulaProfile,
} from '@workspace/freight'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'

const COUNTRIES = ['LK', 'MY', 'SG', 'TH', 'VN', 'ID', 'PH', 'PK', 'BD'] as const

function rateLabel(country: string, formulaId: string | null): string {
  const profile = formulaId ? getFormulaProfile(formulaId) : null
  if (profile) return profile.rateFields.map((f) => f.labelZh).slice(0, 4).join(' / ')
  return country === 'LK' ? 'GD / PAL / VAT / SSCL' : '关税 / 增值税等（以公式为准）'
}

export default function HsTariffsPage() {
  const [q, setQ] = React.useState('')
  const [countryCode, setCountryCode] = React.useState('LK')
  const [formulaProfile, setFormulaProfile] = React.useState(defaultFormulaForCountry('LK') ?? '')
  const [hsCode, setHsCode] = React.useState('')
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10))
  const [dutyRate, setDutyRate] = React.useState('0')
  const [exciseRate, setExciseRate] = React.useState('0')
  const [vatRate, setVatRate] = React.useState('0')
  const [extraRate, setExtraRate] = React.useState('0')
  const formulaOptions = formulasForCountry(countryCode)
  const listQuery = trpc.hsTariffs.list.useQuery({ page: 1, pageSize: 50, q: q || undefined, countryCode })
  const utils = trpc.useUtils()
  const createMutation = trpc.hsTariffs.createDraft.useMutation({
    onSuccess: async () => {
      toast.success('已创建税则草稿（仅本组织，不会推送到其他租户）')
      await utils.hsTariffs.list.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })
  const initFromCatalog = trpc.hsTariffs.initFromCatalog.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.inserted > 0
          ? `已从平台税则库补齐 ${result.inserted} 条（只补缺失，拷贝为草稿，需发布后计算器才使用）`
          : '本组织税则已齐全，无需补齐。',
      )
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

  const onCountryChange = (next: string) => {
    const code = next.toUpperCase()
    setCountryCode(code)
    setFormulaProfile(defaultFormulaForCountry(code) ?? '')
  }

  const isLk = formulaProfile.startsWith('lk_')
  const vatLabel = getFormulaProfile(formulaProfile)?.rateFields.find((f) => f.key === 'vatRate')?.labelZh ?? '增值税'
  const extraField =
    formulaProfile === 'th_vat_v1'
      ? { key: 'interiorTaxRate', label: '内地税率' }
      : formulaProfile === 'id_ppn_v1'
        ? { key: 'incomeTaxRate', label: 'PPh 22 税率' }
        : isLk
          ? { key: 'ssclRate', label: 'SSCL 率' }
          : null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">HS 税则</h2>
        <p className="text-sm text-muted-foreground">
          与 SLSI 合规清单分轨。税率按 HS + 目的国 + 公式版本维护，不写进商品行。已发布版本不可直接改，请新建版本。可从平台全局税则库补齐缺失项（拷贝为草稿，需发布后计算器才使用），不会自动同步到已有租户。非斯里兰卡站点不会套用 LK 税栈。
        </p>
      </div>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={initFromCatalog.isPending}
          onClick={() => initFromCatalog.mutate()}
        >
          {initFromCatalog.isPending ? '补齐中…' : '从平台目录补齐'}
        </Button>
      </div>
      <p className="text-sm">
        <LocaleLink href="/console/costs/calculator" className="underline">返回定价计算器</LocaleLink>
        {' · '}
        <LocaleLink href="/console/compliance-hs-slsi" className="underline">HS/SLSI 合规清单</LocaleLink>
      </p>
      <div className="flex flex-wrap gap-2">
        <Input className="w-40" placeholder="搜索 HS" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={countryCode}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="text-sm font-medium">新建本组织草稿</h3>
        {formulaOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">该目的国尚无计税公式，不能套用斯里兰卡税则。请仅在已支持的站点维护税率。</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Input className="w-40" placeholder="HS，如 8507.60.90" value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
              <Input className="w-36" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={formulaProfile}
                onChange={(e) => setFormulaProfile(e.target.value)}
              >
                {formulaOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.labelZh}</option>
                ))}
              </select>
              <Input className="w-24" placeholder={isLk ? 'GD 率' : '关税率'} value={dutyRate} onChange={(e) => setDutyRate(e.target.value)} />
              {isLk ? (
                <Input className="w-24" placeholder="PAL 率" value={exciseRate} onChange={(e) => setExciseRate(e.target.value)} />
              ) : (
                <Input className="w-28" placeholder="消费税率" value={exciseRate} onChange={(e) => setExciseRate(e.target.value)} />
              )}
              <Input className="w-28" placeholder={`${vatLabel}`} value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
              {extraField ? (
                <Input className="w-28" placeholder={extraField.label} value={extraRate} onChange={(e) => setExtraRate(e.target.value)} />
              ) : null}
              <Button
                size="sm"
                disabled={createMutation.isPending || !hsCode.trim() || !formulaProfile}
                onClick={() => {
                  const duty = Number(dutyRate) || 0
                  const mid = Number(exciseRate) || 0
                  const vat = Number(vatRate) || 0
                  const extra = Number(extraRate) || 0
                  const components: Record<string, unknown> = {
                    dutyRate: duty,
                    vatRate: vat,
                  }
                  if (!isLk) components.exciseRate = mid
                  if (extraField?.key === 'interiorTaxRate') components.interiorTaxRate = extra
                  if (extraField?.key === 'incomeTaxRate') components.incomeTaxRate = extra
                  createMutation.mutate({
                    countryCode,
                    hsCode,
                    effectiveFrom,
                    currency: currencyForCountry(countryCode),
                    formulaProfile,
                    components,
                    gdRate: duty,
                    palRate: isLk ? mid : 0,
                    vatRate: vat,
                    ssclRate: extraField?.key === 'ssclRate' ? extra : 0,
                    cessRate: 0,
                    surchargeRate: 0,
                    exciseRate: isLk ? 0 : mid,
                    isExact: true,
                  })
                }}
              >
                创建草稿
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {getFormulaProfile(formulaProfile)?.descriptionZh} 税率填写小数，如 15% 请填 0.15。创建后需手动发布才会被计算器使用。不要把讲义数字当作验收值。
            </p>
          </>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HS</TableHead>
              <TableHead>国家</TableHead>
              <TableHead>公式</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>范围</TableHead>
              <TableHead>主要税率</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listQuery.data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">暂无税则。请先为本组织创建草稿并发布。</TableCell>
              </TableRow>
            ) : (
              (listQuery.data?.items ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.hsCode}{row.isExact ? '' : ' · 近似'}</TableCell>
                  <TableCell>{row.countryCode}</TableCell>
                  <TableCell className="text-xs">{row.formulaProfile || '—'}</TableCell>
                  <TableCell>v{row.version}</TableCell>
                  <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
                  <TableCell>{row.scope === 'global' ? '平台' : '本组织'}</TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {String(row.gdRate ?? row.components?.dutyRate ?? '—')} / {String(row.vatRate ?? row.components?.vatRate ?? '—')}
                    <div className="text-[10px] text-muted-foreground">{rateLabel(row.countryCode, row.formulaProfile || null)}</div>
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
