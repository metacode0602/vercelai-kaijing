'use client'

import * as React from 'react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import {
  FEE_TEMPLATE_TYPE_LABEL,
  type FeeComponent,
  type FeeTemplateType,
} from '@/lib/crossborder/fee-template-store'
import { trpc } from '@/lib/trpc/client'

type DraftVersion = {
  id: string
  versionNo: number
  effectiveFrom: string
  effectiveTo: string
  priority: number
  formulaProfile: string
  components: FeeComponent[]
  published: boolean
  reviewNeeded: boolean
  note: string
  status: string
  statusLabel: string
}

export default function FeeTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<DraftVersion | null>(null)
  const [notice, setNotice] = React.useState('')
  const [dirty, setDirty] = React.useState(false)

  const detailQuery = trpc.feeTemplates.get.useQuery({ id })
  const template = detailQuery.data
  const versions = template?.versions ?? []

  React.useEffect(() => {
    if (!selectedVersionId && versions[0]) setSelectedVersionId(versions[0].id)
  }, [versions, selectedVersionId])

  const selectedFromServer = versions.find((row) => row.id === selectedVersionId) ?? versions[0]

  React.useEffect(() => {
    if (!selectedFromServer) {
      setDraft(null)
      setDirty(false)
      return
    }
    setDraft({
      id: selectedFromServer.id,
      versionNo: selectedFromServer.versionNo,
      effectiveFrom: selectedFromServer.effectiveFrom,
      effectiveTo: selectedFromServer.effectiveTo,
      priority: selectedFromServer.priority,
      formulaProfile: selectedFromServer.formulaProfile,
      components: selectedFromServer.components.map((c) => ({ ...c })),
      published: selectedFromServer.published,
      reviewNeeded: selectedFromServer.reviewNeeded,
      note: selectedFromServer.note,
      status: selectedFromServer.status,
      statusLabel: selectedFromServer.statusLabel,
    })
    setDirty(false)
  }, [selectedFromServer?.id, selectedFromServer?.updatedAt])

  const invalidate = React.useCallback(async () => {
    await utils.feeTemplates.get.invalidate({ id })
    await utils.feeTemplates.list.invalidate()
  }, [utils, id])

  const createVersionMutation = trpc.feeTemplates.createVersion.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setSelectedVersionId(row.id)
      setNotice(`已基于当前版本创建草稿 v${row.versionNo}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const updateVersionMutation = trpc.feeTemplates.updateVersion.useMutation({
    onSuccess: async () => {
      await invalidate()
      setDirty(false)
      setNotice('版本已保存到数据库。')
    },
    onError: (e) => setNotice(e.message),
  })
  const submitMutation = trpc.feeTemplates.submit.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`v${row.versionNo} 已提交审核（in_review）。`)
    },
    onError: (e) => setNotice(e.message),
  })
  const publishMutation = trpc.feeTemplates.publish.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`已发布 v${row.versionNo}，测算可命中。`)
    },
    onError: (e) => setNotice(e.message),
  })
  const disableVersionMutation = trpc.feeTemplates.disableVersion.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`v${row.versionNo} 已停用。`)
    },
    onError: (e) => setNotice(e.message),
  })
  const updateHeaderMutation = trpc.feeTemplates.update.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('模板头已更新。')
    },
    onError: (e) => setNotice(e.message),
  })

  if (detailQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/fee-templates" title="加载费用模板…" description={id} />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/fee-templates"
          title="未找到费用模板"
          description={`模板 ${id} 不存在或已被删除。${detailQuery.error?.message ?? ''}`}
        />
      </div>
    )
  }

  const typeKey = (template.type === 'platform_fee' ? 'platform_fee' : 'import_tax') as FeeTemplateType
  const selected = draft

  function patchDraft(patch: Partial<DraftVersion>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  function saveComponents(next: FeeComponent[]) {
    patchDraft({ components: next })
  }

  function saveVersion() {
    if (!selected) return
    updateVersionMutation.mutate({
      versionId: selected.id,
      effectiveFrom: selected.effectiveFrom,
      effectiveTo: selected.effectiveTo || null,
      priority: selected.priority,
      formulaProfile: selected.formulaProfile,
      components: selected.components,
      note: selected.note,
      reviewNeeded: selected.reviewNeeded,
    })
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <DetailPageHeader
        backHref="/console/fee-templates"
        title={template.name}
        description={`${template.code} · ${template.platform.toUpperCase()} / ${template.country} · ${template.fulfillmentPool} · ${FEE_TEMPLATE_TYPE_LABEL[typeKey]}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{FEE_TEMPLATE_TYPE_LABEL[typeKey]}</Badge>
        <Badge variant={template.statusLabel === '启用' ? 'secondary' : 'outline'}>
          {template.statusLabel}
        </Badge>
        <Badge variant="outline">物流 {template.fulfillmentLogistics || '不限'}</Badge>
        {template.note ? <Badge variant="outline">{template.note}</Badge> : null}
      </div>

      {notice ? (
        <p role="status" className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">版本时间线</CardTitle>
            <CardDescription className="text-xs">
              重叠区间靠人工优先级；发布后测算才可命中。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={createVersionMutation.isPending}
              onClick={() =>
                createVersionMutation.mutate({
                  templateId: template.id,
                  baseVersionId: selected?.id,
                })
              }
            >
              新建草稿版本
            </Button>
            <div className="space-y-1">
              {versions.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedVersionId(row.id)}
                  className={`flex w-full flex-col rounded-md border px-3 py-2 text-left text-xs transition ${
                    selected?.id === row.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className="font-medium">
                    v{row.versionNo} · 优先级 {row.priority}
                  </span>
                  <span className="text-muted-foreground">
                    {row.effectiveFrom} → {row.effectiveTo || '长期'} · {row.statusLabel}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selected ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">版本 v{selected.versionNo}</CardTitle>
                <CardDescription className="text-xs">{selected.id}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>生效起</Label>
                  <Input
                    type="date"
                    value={selected.effectiveFrom}
                    onChange={(e) => patchDraft({ effectiveFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>生效止（可空）</Label>
                  <Input
                    type="date"
                    value={selected.effectiveTo}
                    onChange={(e) => patchDraft({ effectiveTo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>优先级（越大越优先）</Label>
                  <Input
                    type="number"
                    value={selected.priority}
                    onChange={(e) => patchDraft({ priority: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>公式档 formulaProfile</Label>
                  <Input
                    value={selected.formulaProfile}
                    onChange={(e) => patchDraft({ formulaProfile: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>备注</Label>
                  <Textarea
                    value={selected.note}
                    onChange={(e) => patchDraft({ note: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Badge variant={selected.published ? 'secondary' : 'outline'}>
                    {selected.statusLabel || (selected.published ? '已发布' : '草稿')}
                  </Badge>
                  {selected.reviewNeeded ? <Badge variant="outline">待报关行复核</Badge> : null}
                  {dirty ? <Badge variant="outline">未保存</Badge> : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!dirty || updateVersionMutation.isPending || selected.published}
                    onClick={saveVersion}
                  >
                    保存版本
                  </Button>
                  {!selected.published && selected.status !== 'in_review' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submitMutation.isPending || dirty}
                      onClick={() => submitMutation.mutate({ versionId: selected.id })}
                    >
                      提交审核
                    </Button>
                  ) : null}
                  {!selected.published ? (
                    <Button
                      size="sm"
                      disabled={publishMutation.isPending || dirty}
                      onClick={() => publishMutation.mutate({ versionId: selected.id })}
                    >
                      发布此版本
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disableVersionMutation.isPending}
                      onClick={() => disableVersionMutation.mutate({ versionId: selected.id })}
                    >
                      停用此版本
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updateHeaderMutation.isPending}
                    onClick={() =>
                      updateHeaderMutation.mutate({ id: template.id, status: '启用' })
                    }
                  >
                    启用模板头
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">费用组件</CardTitle>
                    <CardDescription className="text-xs">
                      进口税常见 customs/cess/pal/vat/sscl；平台费常见 commission/payment_fee。修改后点「保存版本」。
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selected.published}
                    onClick={() =>
                      saveComponents([
                        ...selected.components,
                        {
                          code: `comp_${selected.components.length + 1}`,
                          labelZh: '新组件',
                          rate: 0,
                          unit: 'pct',
                          baseHint: '',
                          note: '',
                        },
                      ])
                    }
                  >
                    添加组件
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>编码</TableHead>
                        <TableHead>名称</TableHead>
                        <TableHead>比率/金额</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead>税基提示</TableHead>
                        <TableHead className="w-20">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.components.map((comp, index) => (
                        <TableRow key={`${comp.code}-${index}`}>
                          <TableCell>
                            <Input
                              className="h-8 min-w-24"
                              value={comp.code}
                              disabled={selected.published}
                              onChange={(e) => {
                                const next = selected.components.map((c, i) =>
                                  i === index ? { ...c, code: e.target.value } : c,
                                )
                                saveComponents(next)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 min-w-24"
                              value={comp.labelZh}
                              disabled={selected.published}
                              onChange={(e) => {
                                const next = selected.components.map((c, i) =>
                                  i === index ? { ...c, labelZh: e.target.value } : c,
                                )
                                saveComponents(next)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-24"
                              type="number"
                              step="0.001"
                              value={comp.rate}
                              disabled={selected.published}
                              onChange={(e) => {
                                const next = selected.components.map((c, i) =>
                                  i === index ? { ...c, rate: Number(e.target.value) || 0 } : c,
                                )
                                saveComponents(next)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={comp.unit}
                              disabled={selected.published}
                              onValueChange={(value) => {
                                const unit: FeeComponent['unit'] = value === 'usd' ? 'usd' : 'pct'
                                const next: FeeComponent[] = selected.components.map((c, i) =>
                                  i === index ? { ...c, unit } : c,
                                )
                                saveComponents(next)
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pct">比例</SelectItem>
                                <SelectItem value="usd">USD</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 min-w-28"
                              value={comp.baseHint ?? ''}
                              disabled={selected.published}
                              onChange={(e) => {
                                const next = selected.components.map((c, i) =>
                                  i === index ? { ...c, baseHint: e.target.value } : c,
                                )
                                saveComponents(next)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={selected.published}
                              onClick={() =>
                                saveComponents(selected.components.filter((_, i) => i !== index))
                              }
                            >
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {selected.components.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                            暂无组件，请添加。
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <FeeTemplateMatchRules templateId={template.id} />
          </div>
        ) : null}
      </div>
    </div>
  )
}


function FeeTemplateMatchRules({ templateId }: { templateId: string }) {
  const utils = trpc.useUtils()
  const rulesQuery = trpc.feeTemplates.listMatchRules.useQuery({ templateId })
  const categoriesQuery = trpc.categories.list.useQuery({})
  const categoryRows = (categoriesQuery.data ?? []) as Array<{ id: string; name: string; status: string }>
  const [categoryId, setCategoryId] = React.useState('')
  const [hsCodePattern, setHsCodePattern] = React.useState('')
  const [priority, setPriority] = React.useState('20')
  const replaceMutation = trpc.feeTemplates.replaceMatchRules.useMutation({
    onSuccess: async () => {
      setNoticeSafe()
      await utils.feeTemplates.listMatchRules.invalidate({ templateId })
    },
    onError: (err) => setErrorSafe(err.message),
  })
  const [localNotice, setLocalNotice] = React.useState('')
  function setNoticeSafe() {
    setLocalNotice('匹配规则已保存。定价计算器将按品类 / HS 与优先级自动选用本模板。')
  }
  function setErrorSafe(message: string) {
    setLocalNotice(message)
  }
  const rules = rulesQuery.data ?? []
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">匹配规则（品类 / HS）</CardTitle>
        <CardDescription>
          可选。有规则时，仅当 SKU 品类或 HS 命中才会选用本模板；多条按优先级（越大越优先）且更具体（HS 优于品类）排序。无规则则仍按平台+国家匹配。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {localNotice ? <p className="text-sm text-muted-foreground">{localNotice}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>品类</TableHead>
              <TableHead>HS 模式</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">暂无规则，模板对所有该平台/站点 SKU 可用。</TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{categoryRows.find((c) => c.id === rule.categoryId)?.name || rule.categoryId || '—'}</TableCell>
                  <TableCell className="font-mono">{rule.hsCodePattern || '—'}</TableCell>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        replaceMutation.mutate({
                          templateId,
                          rules: rules
                            .filter((r) => r.id !== rule.id)
                            .map((r) => ({
                              categoryId: r.categoryId,
                              hsCodePattern: r.hsCodePattern,
                              priority: r.priority,
                              note: r.note,
                            })),
                        })
                      }
                    >
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap gap-2">
          <Select value={categoryId || '__none__'} onValueChange={(v) => setCategoryId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="品类（可选）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不限品类</SelectItem>
              {categoryRows.filter((c) => c.status === '启用').map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="w-36" placeholder="HS 前缀" value={hsCodePattern} onChange={(e) => setHsCodePattern(e.target.value)} />
          <Input className="w-24" placeholder="优先级" value={priority} onChange={(e) => setPriority(e.target.value)} />
          <Button
            size="sm"
            disabled={replaceMutation.isPending || (!categoryId && !hsCodePattern.trim())}
            onClick={() =>
              replaceMutation.mutate({
                templateId,
                rules: [
                  ...rules.map((r) => ({
                    categoryId: r.categoryId,
                    hsCodePattern: r.hsCodePattern,
                    priority: r.priority,
                    note: r.note,
                  })),
                  {
                    categoryId: categoryId || null,
                    hsCodePattern: hsCodePattern.trim() || undefined,
                    priority: Number(priority) || 20,
                  },
                ],
              })
            }
          >
            添加规则
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
