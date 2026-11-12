'use client'

import * as React from 'react'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { FEE_TEMPLATE_TYPES } from '@/lib/console/platform-catalog-options'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect } from '@workspace/ui/components/native-select'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

type HeaderForm = {
  code: string
  name: string
  platform: string
  country: string
  fulfillmentPool: string
  fulfillmentLogistics: string
  type: 'import_tax' | 'platform_fee' | 'ocean_freight'
  status: 'active' | 'inactive'
  note: string
}

type VersionForm = {
  effectiveFrom: string
  effectiveTo: string
  priority: string
  formulaProfile: string
  componentsText: string
  note: string
  status: 'active' | 'inactive'
}

type RuleForm = {
  categoryCode: string
  hsCodePattern: string
  priority: string
  note: string
}

const emptyHeader = (): HeaderForm => ({
  code: '',
  name: '',
  platform: 'daraz',
  country: 'LK',
  fulfillmentPool: '',
  fulfillmentLogistics: '',
  type: 'platform_fee',
  status: 'active',
  note: '',
})

const emptyVersion = (): VersionForm => ({
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  priority: '10',
  formulaProfile: '',
  componentsText: '',
  note: '',
  status: 'active',
})

const emptyRule = (): RuleForm => ({
  categoryCode: '',
  hsCodePattern: '',
  priority: '10',
  note: '',
})

function typeLabel(type: string) {
  return FEE_TEMPLATE_TYPES.find((item) => item.value === type)?.label ?? type
}

function parseComponents(text: string) {
  return text
    .split('\\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, labelZh, rate, unit] = line.split(',').map((part) => part.trim())
      const parsed = rate ? Number(rate) : null
      return {
        code: code || '',
        labelZh: labelZh || code || '',
        rate: parsed != null && Number.isFinite(parsed) ? parsed : null,
        unit: (unit === 'usd' || unit === 'amount' || unit === 'lkr' || unit === 'per_kg' || unit === 'per_unit' ? unit : 'pct') as
          | 'pct'
          | 'usd'
          | 'amount'
          | 'lkr'
          | 'per_kg'
          | 'per_unit',
      }
    })
    .filter((item) => item.code)
}

function formatComponents(items: { code: string; labelZh: string; rate: number | null; unit: string }[]) {
  return items.map((item) => `${item.code}, ${item.labelZh}, ${item.rate ?? ''}, ${item.unit}`).join('\\n')
}

export default function PlatformFeeTemplatesPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [type, setType] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [headerForm, setHeaderForm] = React.useState<HeaderForm>(emptyHeader())
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [versionForm, setVersionForm] = React.useState<VersionForm>(emptyVersion())
  const [editingVersionId, setEditingVersionId] = React.useState<string | null>(null)
  const [ruleForm, setRuleForm] = React.useState<RuleForm>(emptyRule())

  const listQuery = trpc.platformFeeTemplates.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
    type: type === 'import_tax' || type === 'platform_fee' || type === 'ocean_freight' ? type : undefined,
  })
  const versionsQuery = trpc.platformFeeTemplates.listVersions.useQuery(
    { templateId: detailId ?? '' },
    { enabled: Boolean(detailId) },
  )
  const rulesQuery = trpc.platformFeeTemplates.listRules.useQuery(
    { templateId: detailId ?? '' },
    { enabled: Boolean(detailId) },
  )

  const invalidate = async () => {
    await utils.platformFeeTemplates.list.invalidate()
    await utils.platformFeeTemplates.listVersions.invalidate()
    await utils.platformFeeTemplates.listRules.invalidate()
  }

  const createMutation = trpc.platformFeeTemplates.create.useMutation({
    onSuccess: async (row) => {
      setHeaderOpen(false)
      setNotice(`已新增默认费用模板 ${row.code}。请添加版本并填写费率后保持启用，新组织审核通过时会拷贝为草稿。`)
      setDetailId(row.id)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformFeeTemplates.update.useMutation({
    onSuccess: async (row) => {
      setHeaderOpen(false)
      setEditingId(null)
      setNotice(`已更新默认费用模板 ${row.code}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformFeeTemplates.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从默认费用模板目录删除；已拷贝到组织的草稿保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const createVersionMutation = trpc.platformFeeTemplates.createVersion.useMutation({
    onSuccess: async () => {
      setVersionForm(emptyVersion())
      setEditingVersionId(null)
      setNotice('已新增模板版本（费率由运营填写，不会标记为官方实时同步）。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateVersionMutation = trpc.platformFeeTemplates.updateVersion.useMutation({
    onSuccess: async () => {
      setVersionForm(emptyVersion())
      setEditingVersionId(null)
      setNotice('已更新模板版本')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeVersionMutation = trpc.platformFeeTemplates.removeVersion.useMutation({
    onSuccess: async () => {
      setNotice('已删除模板版本')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const createRuleMutation = trpc.platformFeeTemplates.createRule.useMutation({
    onSuccess: async () => {
      setRuleForm(emptyRule())
      setNotice('已新增匹配规则')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeRuleMutation = trpc.platformFeeTemplates.removeRule.useMutation({
    onSuccess: async () => {
      setNotice('已删除匹配规则')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const headerPending = createMutation.isPending || updateMutation.isPending
  const colSpan = 8
  const versions = versionsQuery.data ?? []
  const rules = rulesQuery.data ?? []

  function openCreate() {
    setEditingId(null)
    setHeaderForm(emptyHeader())
    setHeaderOpen(true)
  }

  function openEdit(row: (typeof rows)[number]) {
    setEditingId(row.id)
    setHeaderForm({
      code: row.code,
      name: row.name,
      platform: row.platform,
      country: row.country,
      fulfillmentPool: row.fulfillmentPool,
      fulfillmentLogistics: row.fulfillmentLogistics,
      type: row.type,
      status: row.status,
      note: row.note,
    })
    setHeaderOpen(true)
  }

  function saveHeader() {
    const payload = { ...headerForm }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload })
      return
    }
    createMutation.mutate(payload)
  }

  function saveVersion() {
    if (!detailId) return
    const payload = {
      effectiveFrom: versionForm.effectiveFrom,
      effectiveTo: versionForm.effectiveTo || undefined,
      priority: versionForm.priority.trim() ? Number(versionForm.priority) : undefined,
      formulaProfile: versionForm.formulaProfile || undefined,
      components: parseComponents(versionForm.componentsText),
      note: versionForm.note,
      status: versionForm.status,
    }
    if (editingVersionId) {
      updateVersionMutation.mutate({ id: editingVersionId, ...payload })
      return
    }
    createVersionMutation.mutate({ templateId: detailId, ...payload })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">默认费用模板</h2>
          <p className="text-sm text-muted-foreground">
            由平台运营维护默认费用模板结构与费率。新企业审核通过时只拷贝启用项，并以组织草稿落地，需租户复核发布后计算器才会使用。不是官方实时同步，也不会推送到已有租户。
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          新增模板
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPage(1)
          }}
          placeholder="搜索编码、名称或平台"
          className="h-8 w-56"
        />
        <NativeSelect
          value={type}
          onChange={(event) => {
            setType(event.target.value)
            setPage(1)
          }}
        >
          <option value="">全部类型</option>
          {FEE_TEMPLATE_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="inactive">停用</option>
        </NativeSelect>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>编码</TableHead>
            <TableHead>名称</TableHead>
            <TableHead>平台 / 国家</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>版本数</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>说明</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listQuery.isLoading ? (
            <TableLoadingRow colSpan={colSpan} />
          ) : listQuery.isError ? (
            <TableErrorRow
              colSpan={colSpan}
              message={listQuery.error.message}
              onRetry={() => listQuery.refetch()}
            />
          ) : rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-xs">
                  {row.platform} / {row.country}
                </TableCell>
                <TableCell>{typeLabel(row.type)}</TableCell>
                <TableCell>{row.versionCount}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>
                    {row.status === 'active' ? '启用' : '停用'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{row.note || '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(row.id)}>
                      版本与规则
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removeMutation.isPending}
                      onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={colSpan}>暂无数据。请新增模板并填写费率，不预置官方佣金或税率。</TableEmptyRow>
          )}
        </TableBody>
      </Table>

      <ListPagination
        page={page}
        totalPages={pageCount}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Dialog open={headerOpen} onOpenChange={(open) => { setHeaderOpen(open); if (!open) setEditingId(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑默认费用模板' : '新增默认费用模板'}</DialogTitle>
            <DialogDescription>
              写入平台目录。启用后才会在审核通过时拷贝到新组织，拷贝结果为草稿，不会显示「已从平台实时同步」。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fee-code">编码</Label>
              <Input
                id="fee-code"
                value={headerForm.code}
                readOnly={Boolean(editingId)}
                placeholder="daraz_lk_platform_fee"
                onChange={(event) => setHeaderForm((current) => ({ ...current, code: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fee-name">名称</Label>
              <Input
                id="fee-name"
                value={headerForm.name}
                onChange={(event) => setHeaderForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="fee-platform">平台</Label>
                <Input
                  id="fee-platform"
                  value={headerForm.platform}
                  placeholder="daraz / lazada"
                  onChange={(event) => setHeaderForm((current) => ({ ...current, platform: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-country">国家</Label>
                <Input
                  id="fee-country"
                  value={headerForm.country}
                  placeholder="LK"
                  onChange={(event) => setHeaderForm((current) => ({ ...current, country: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="fee-pool">履约池（可空）</Label>
                <Input
                  id="fee-pool"
                  value={headerForm.fulfillmentPool}
                  onChange={(event) => setHeaderForm((current) => ({ ...current, fulfillmentPool: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-logistics">物流形态（可空）</Label>
                <Input
                  id="fee-logistics"
                  value={headerForm.fulfillmentLogistics}
                  placeholder="FCL / LCL / AIR_DDP"
                  onChange={(event) => setHeaderForm((current) => ({ ...current, fulfillmentLogistics: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="fee-type">类型</Label>
                <NativeSelect
                  id="fee-type"
                  value={headerForm.type}
                  onChange={(event) =>
                    setHeaderForm((current) => ({
                      ...current,
                      type: event.target.value as HeaderForm['type'],
                    }))
                  }
                >
                  {FEE_TEMPLATE_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-status">状态</Label>
                <NativeSelect
                  id="fee-status"
                  value={headerForm.status}
                  onChange={(event) =>
                    setHeaderForm((current) => ({
                      ...current,
                      status: event.target.value === 'inactive' ? 'inactive' : 'active',
                    }))
                  }
                >
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fee-note">说明</Label>
              <Textarea
                id="fee-note"
                rows={3}
                value={headerForm.note}
                onChange={(event) => setHeaderForm((current) => ({ ...current, note: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeaderOpen(false)}>
              取消
            </Button>
            <Button disabled={headerPending || !headerForm.code.trim() || !headerForm.name.trim()} onClick={saveHeader}>
              {headerPending ? '保存中…' : editingId ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => { if (!open) { setDetailId(null); setEditingVersionId(null); setVersionForm(emptyVersion()) } }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>版本与匹配规则</DialogTitle>
            <DialogDescription>
              版本中的费率由运营填写。组件格式：编码, 名称, 费率, 单位（pct/usd/amount），每行一条；费率可留空，不会预置官方数字。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <h3 className="text-sm font-medium">版本</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本</TableHead>
                  <TableHead>生效日</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>组件</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.length ? (
                  versions.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">v{row.versionNo}</TableCell>
                      <TableCell className="text-xs">{row.effectiveFrom}</TableCell>
                      <TableCell>{row.priority}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs">
                        {row.components.map((item) => item.labelZh || item.code).join('、') || '—'}
                      </TableCell>
                      <TableCell>{row.status === 'active' ? '启用' : '停用'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingVersionId(row.id)
                            setVersionForm({
                              effectiveFrom: row.effectiveFrom,
                              effectiveTo: row.effectiveTo,
                              priority: String(row.priority),
                              formulaProfile: row.formulaProfile,
                              componentsText: formatComponents(row.components),
                              note: row.note,
                              status: row.status,
                            })
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeVersionMutation.mutate({ id: row.id })}
                        >
                          删除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyRow colSpan={6}>还没有版本，请在下方新增。</TableEmptyRow>
                )}
              </TableBody>
            </Table>
            <div className="grid gap-3 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>生效日</Label>
                  <Input
                    type="date"
                    value={versionForm.effectiveFrom}
                    onChange={(event) => setVersionForm((current) => ({ ...current, effectiveFrom: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>失效日（可空）</Label>
                  <Input
                    type="date"
                    value={versionForm.effectiveTo}
                    onChange={(event) => setVersionForm((current) => ({ ...current, effectiveTo: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>优先级</Label>
                  <Input
                    value={versionForm.priority}
                    onChange={(event) => setVersionForm((current) => ({ ...current, priority: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>状态</Label>
                  <NativeSelect
                    value={versionForm.status}
                    onChange={(event) =>
                      setVersionForm((current) => ({
                        ...current,
                        status: event.target.value === 'inactive' ? 'inactive' : 'active',
                      }))
                    }
                  >
                    <option value="active">启用</option>
                    <option value="inactive">停用</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>组件（每行：编码, 名称, 费率, 单位）</Label>
                <Textarea
                  rows={4}
                  value={versionForm.componentsText}
                  placeholder="commission, 佣金, , pct"
                  onChange={(event) => setVersionForm((current) => ({ ...current, componentsText: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>备注</Label>
                <Input
                  value={versionForm.note}
                  onChange={(event) => setVersionForm((current) => ({ ...current, note: event.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={createVersionMutation.isPending || updateVersionMutation.isPending}
                  onClick={saveVersion}
                >
                  {editingVersionId ? '保存版本' : '新增版本'}
                </Button>
                {editingVersionId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingVersionId(null)
                      setVersionForm(emptyVersion())
                    }}
                  >
                    取消编辑
                  </Button>
                ) : null}
              </div>
            </div>

            <h3 className="text-sm font-medium">匹配规则</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品类编码</TableHead>
                  <TableHead>HS 模式</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length ? (
                  rules.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.categoryCode || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.hsCodePattern || '—'}</TableCell>
                      <TableCell>{row.priority}</TableCell>
                      <TableCell className="text-xs">{row.note || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeRuleMutation.mutate({ id: row.id })}>
                          删除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyRow colSpan={5}>还没有匹配规则，可不填；拷贝时会按品类编码映射到组织品类。</TableEmptyRow>
                )}
              </TableBody>
            </Table>
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
              <Input
                placeholder="品类编码，如 APPAREL"
                value={ruleForm.categoryCode}
                onChange={(event) => setRuleForm((current) => ({ ...current, categoryCode: event.target.value }))}
              />
              <Input
                placeholder="HS 前缀或完整编码"
                value={ruleForm.hsCodePattern}
                onChange={(event) => setRuleForm((current) => ({ ...current, hsCodePattern: event.target.value }))}
              />
              <Input
                placeholder="优先级"
                value={ruleForm.priority}
                onChange={(event) => setRuleForm((current) => ({ ...current, priority: event.target.value }))}
              />
              <Input
                placeholder="说明"
                value={ruleForm.note}
                onChange={(event) => setRuleForm((current) => ({ ...current, note: event.target.value }))}
              />
              <div className="col-span-2">
                <Button
                  size="sm"
                  disabled={!detailId || createRuleMutation.isPending}
                  onClick={() =>
                    detailId &&
                    createRuleMutation.mutate({
                      templateId: detailId,
                      categoryCode: ruleForm.categoryCode || undefined,
                      hsCodePattern: ruleForm.hsCodePattern || undefined,
                      priority: ruleForm.priority.trim() ? Number(ruleForm.priority) : undefined,
                      note: ruleForm.note || undefined,
                    })
                  }
                >
                  新增规则
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除默认费用模板"
        description={
          deleteTarget
            ? `确认从平台目录删除「${deleteTarget.name}」？已有组织引用时无法删除，请改为停用。组织内已拷贝的草稿不受影响。`
            : ''
        }
        confirmLabel="确认删除"
        confirmVariant="destructive"
        pending={removeMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            removeMutation.mutate({ id: deleteTarget.id })
            setDeleteTarget(null)
          }
        }}
      />
    </div>
  )
}
