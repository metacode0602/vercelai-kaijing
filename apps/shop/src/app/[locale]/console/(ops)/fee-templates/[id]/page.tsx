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
  createFeeTemplateVersionDraft,
  getFeeTemplate,
  listFeeTemplateVersions,
  publishFeeTemplateVersion,
  updateFeeTemplateVersion,
  upsertFeeTemplate,
  useFeeTemplateStore,
  type FeeComponent,
  type FeeTemplateVersion,
} from '@/lib/crossborder/fee-template-store'

export default function FeeTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const state = useFeeTemplateStore()
  const template = getFeeTemplate(id) ?? state.templates.find((row) => row.id === id)
  const versions = template ? listFeeTemplateVersions(template.id) : []
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    if (!selectedVersionId && versions[0]) setSelectedVersionId(versions[0].id)
  }, [versions, selectedVersionId])

  const selected = versions.find((row) => row.id === selectedVersionId) ?? versions[0]

  if (!template) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/fee-templates"
          title="未找到费用模板"
          description={`模板 ${id} 不存在或已被删除。`}
        />
      </div>
    )
  }

  function saveComponents(next: FeeComponent[]) {
    if (!selected) return
    updateFeeTemplateVersion(selected.id, { components: next })
    setNotice('组件已保存到当前版本（本地会话）。')
  }

  function patchSelected(patch: Partial<FeeTemplateVersion>) {
    if (!selected) return
    updateFeeTemplateVersion(selected.id, patch)
    setNotice('版本字段已更新。')
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <DetailPageHeader
        backHref="/console/fee-templates"
        title={template.name}
        description={`${template.code} · ${template.platform.toUpperCase()} / ${template.country} · ${template.fulfillmentPool} · ${FEE_TEMPLATE_TYPE_LABEL[template.type]}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{FEE_TEMPLATE_TYPE_LABEL[template.type]}</Badge>
        <Badge variant={template.status === '启用' ? 'secondary' : 'outline'}>{template.status}</Badge>
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
              onClick={() => {
                const draft = createFeeTemplateVersionDraft(template.id, selected)
                setSelectedVersionId(draft.id)
                setNotice(`已基于当前版本创建草稿 v${draft.versionNo}`)
              }}
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
                    {row.effectiveFrom} → {row.effectiveTo || '长期'} ·{' '}
                    {row.published ? '已发布' : '草稿'}
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
                    onChange={(e) => patchSelected({ effectiveFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>生效止（可空）</Label>
                  <Input
                    type="date"
                    value={selected.effectiveTo}
                    onChange={(e) => patchSelected({ effectiveTo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>优先级（越大越优先）</Label>
                  <Input
                    type="number"
                    value={selected.priority}
                    onChange={(e) => patchSelected({ priority: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>公式档 formulaProfile</Label>
                  <Input
                    value={selected.formulaProfile}
                    onChange={(e) => patchSelected({ formulaProfile: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>备注</Label>
                  <Textarea
                    value={selected.note}
                    onChange={(e) => patchSelected({ note: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Badge variant={selected.published ? 'secondary' : 'outline'}>
                    {selected.published ? '已发布' : '草稿'}
                  </Badge>
                  {selected.reviewNeeded ? <Badge variant="outline">待报关行复核</Badge> : null}
                  {!selected.published ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        publishFeeTemplateVersion(selected.id)
                        setNotice(`已发布 v${selected.versionNo}，测算可命中。`)
                      }}
                    >
                      发布此版本
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      upsertFeeTemplate({ ...template, status: '启用' })
                      setNotice('模板头已标为启用。')
                    }}
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
                      进口税常见 customs/cess/pal/vat/sscl；平台费常见 commission/payment_fee。
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
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
          </div>
        ) : null}
      </div>
    </div>
  )
}
