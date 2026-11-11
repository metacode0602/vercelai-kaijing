'use client'

import * as React from 'react'
import * as XLSX from 'xlsx'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20

const HEADER_ALIASES: Record<string, string> = {
  hs编码: 'hsCode',
  hs: 'hsCode',
  hscode: 'hsCode',
  hs_code: 'hsCode',
  描述: 'description',
  description: 'description',
  slsi强制: 'slsiRequired',
  slsi: 'slsiRequired',
  slsi_required: 'slsiRequired',
  证书名称: 'certName',
  certname: 'certName',
  cert_name: 'certName',
  阻断建档: 'blockCreate',
  block: 'blockCreate',
  block_create: 'blockCreate',
  blocklisting: 'blockCreate',
  生效日期: 'validFrom',
  validfrom: 'validFrom',
  valid_from: 'validFrom',
  失效日期: 'validTo',
  validto: 'validTo',
  valid_to: 'validTo',
  状态: 'status',
  status: 'status',
  备注: 'notes',
  notes: 'notes',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function parseImportRows(file: File): Promise<Array<{
  hsCode?: string
  description?: string
  slsiRequired?: string
  certName?: string
  blockCreate?: string
  validFrom?: string
  validTo?: string
  status?: string
  notes?: string
}>> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return []
    const sheet = workbook.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
    return raw.map((row) => {
      const mapped: Record<string, string> = {}
      for (const [key, value] of Object.entries(row)) {
        const field = HEADER_ALIASES[normalizeHeader(key)]
        if (!field) continue
        mapped[field] = String(value ?? '').trim()
      }
      return mapped
    })
  })
}

function downloadTemplate() {
  const rows = [
    {
      HS编码: '示例：8516.31（本行仅作说明，导入时将跳过）',
      描述: '电吹风 / 干发器',
      SLSI强制: '是',
      证书名称: 'SLSI 电热器具强制认证',
      阻断建档: '是',
      生效日期: '',
      失效日期: '',
      状态: '启用',
      备注: '请删除本行后填写真实清单，系统不会预置官方数据',
    },
  ]
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'HS清单')
  XLSX.writeFile(workbook, 'hs-slsi-import-template.xlsx')
}

export default function ComplianceHsSlsiPage() {
  const utils = trpc.useUtils()
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [slsiFilter, setSlsiFilter] = React.useState('全部')
  const [blockFilter, setBlockFilter] = React.useState('全部')
  const [lookupCode, setLookupCode] = React.useState('')
  const [lookupRequested, setLookupRequested] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [certOpen, setCertOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [noticeError, setNoticeError] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [certFile, setCertFile] = React.useState<{ name: string; url: string } | null>(null)

  const showOk = (message: string) => {
    setNoticeError(false)
    setNotice(message)
  }
  const showErr = (message: string) => {
    setNoticeError(true)
    setNotice(message)
  }

  const listQuery = trpc.compliance.listRules.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status === '启用' ? 'enabled' : 'disabled',
    slsiRequired: slsiFilter === '全部' ? undefined : slsiFilter === '强制',
    blockCreate: blockFilter === '全部' ? undefined : blockFilter === '阻断',
  })
  const certsQuery = trpc.compliance.listCerts.useQuery({})
  const productsQuery = trpc.products.list.useQuery({ page: 1, pageSize: 100 })
  const lookupQuery = trpc.compliance.lookup.useQuery(
    { hsCode: lookupRequested },
    { enabled: Boolean(lookupRequested) },
  )

  const invalidate = async () => {
    await Promise.all([utils.compliance.listRules.invalidate(), utils.compliance.listCerts.invalidate()])
  }

  const createMutation = trpc.compliance.createRule.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setCreateOpen(false)
      showOk(`已新增 HS ${row.hsCode}`)
    },
    onError: (error) => showErr(error.message),
  })
  const updateMutation = trpc.compliance.updateRule.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setEditingId(null)
      showOk(`已更新 HS ${row.hsCode}`)
    },
    onError: (error) => showErr(error.message),
  })
  const statusMutation = trpc.compliance.setStatus.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      showOk(`HS ${row.hsCode} 已${row.status === 'enabled' ? '启用' : '停用'}`)
    },
    onError: (error) => showErr(error.message),
  })
  const importMutation = trpc.compliance.importRules.useMutation({
    onSuccess: async (result) => {
      await invalidate()
      setImporting(false)
      showOk(
        `导入完成：成功 ${result.success}（新增 ${result.inserted} / 更新 ${result.updated}），跳过 ${result.skipped}，失败 ${result.failed}`,
      )
      if (result.failed > 0) setNoticeError(true)
    },
    onError: (error) => {
      setImporting(false)
      showErr(error.message)
    },
  })
  const upsertCertMutation = trpc.compliance.upsertCert.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setCertOpen(false)
      setCertFile(null)
      showOk(`已保存证书 ${row.certNumber}`)
    },
    onError: (error) => showErr(error.message),
  })
  const certStatusMutation = trpc.compliance.setCertStatus.useMutation({
    onSuccess: async () => {
      await invalidate()
      showOk('证书状态已更新')
    },
    onError: (error) => showErr(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const editing = rows.find((item) => item.id === editingId) ?? null
  const productOptions = (productsQuery.data?.items ?? []).map((item) => ({
    value: item.id,
    title: `${item.spu} · ${item.name}`,
  }))

  const ruleFields = (defaults?: typeof editing) => [
    {
      key: 'hsCode',
      label: 'HS 编码',
      required: true,
      defaultValue: defaults?.hsCode ?? '',
      placeholder: '如 8516.31',
      helper: '将规范化后按组织唯一保存；不预置官方税则。',
    },
    { key: 'description', label: '描述', defaultValue: defaults?.description ?? '' },
    {
      key: 'slsiRequired',
      label: 'SLSI 强制',
      options: ['否', '是'],
      defaultValue: defaults?.slsiRequired ? '是' : '否',
    },
    { key: 'certName', label: '证书名称', defaultValue: defaults?.certName ?? '' },
    {
      key: 'blockCreate',
      label: '阻断建档/上架',
      options: ['否', '是'],
      defaultValue: defaults?.blockCreate ? '是' : '否',
    },
    { key: 'validFrom', label: '生效日期', type: 'date' as const, defaultValue: formatDate(defaults?.validFrom).replace('—', '') },
    { key: 'validTo', label: '失效日期', type: 'date' as const, defaultValue: formatDate(defaults?.validTo).replace('—', '') },
    {
      key: 'status',
      label: '状态',
      options: ['启用', '停用'],
      defaultValue: defaults?.status === 'disabled' ? '停用' : '启用',
    },
    { key: 'notes', label: '备注', type: 'textarea' as const, fullWidth: true, defaultValue: defaults?.notes ?? '' },
  ]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>HS 查询与 SLSI 认证已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          清单由本组织手工录入或导入，系统不预置官方或演示数据。商品填写 HS 且命中「强制认证 + 阻断建档」、又没有有效证书时，服务端会拒绝建档和本地上架；未填 HS 不阻断，但商品页会提示未做合规校验。
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-sm font-medium" htmlFor="hs-lookup">
            HS 查询
          </label>
          <Input
            id="hs-lookup"
            value={lookupCode}
            placeholder="输入 HS 编码，如 8516.31"
            onChange={(event) => setLookupCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setLookupRequested(lookupCode.trim())
            }}
          />
        </div>
        <Button
          size="sm"
          onClick={() => setLookupRequested(lookupCode.trim())}
          disabled={!lookupCode.trim()}
        >
          查询
        </Button>
      </div>
      {lookupRequested ? (
        <p className="text-sm text-muted-foreground" role="status">
          {lookupQuery.isLoading
            ? '正在查询…'
            : lookupQuery.error
              ? lookupQuery.error.message
              : lookupQuery.data
                ? `${lookupQuery.data.message}${lookupQuery.data.rule ? `（清单状态：${lookupQuery.data.rule.status === 'enabled' ? '启用' : '停用'}）` : ''}`
                : '—'}
        </p>
      ) : null}

      <UedWorkspace
        title="认证清单"
        description="一行一个 HS。软停用，不硬删除。导入按 HS 新增或更新，失败行不会报整体成功。"
        rows={rows}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="搜索 HS / 描述 / 证书名称"
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: listQuery.data?.total ?? 0,
          onPageChange: setPage,
        }}
        emptyText={
          listQuery.isLoading
            ? '正在加载清单…'
            : listQuery.isError
              ? `加载失败：${listQuery.error.message}`
              : '暂无清单。请手工新增或导入 Excel/CSV，不会预置官方演示数据。'
        }
        addLabel="新增 HS"
        onAdd={() => setCreateOpen(true)}
        columns={[
          { key: 'hsCode', label: 'HS' },
          { key: 'description', label: '描述' },
          {
            key: 'slsiRequired',
            label: 'SLSI 强制',
            render: (row) => <Badge variant={row.slsiRequired ? 'destructive' : 'outline'}>{row.slsiRequired ? '是' : '否'}</Badge>,
          },
          { key: 'certName', label: '证书要求' },
          {
            key: 'blockCreate',
            label: '阻断',
            render: (row) => <Badge variant={row.blockCreate ? 'destructive' : 'secondary'}>{row.blockCreate ? '阻断建档' : '不阻断'}</Badge>,
          },
          {
            key: 'source',
            label: '来源',
            render: (row) => (row.source === 'import' ? '导入' : '手工'),
          },
          {
            key: 'valid',
            label: '有效期',
            render: (row) => `${formatDate(row.validFrom)} ~ ${formatDate(row.validTo)}`,
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={row.status === 'enabled' ? 'secondary' : 'outline'}>{row.status === 'enabled' ? '启用' : '停用'}</Badge>,
          },
          {
            key: 'actions',
            label: '操作',
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(row.id)}>
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    statusMutation.mutate({
                      id: row.id,
                      status: row.status === 'enabled' ? 'disabled' : 'enabled',
                    })
                  }
                >
                  {row.status === 'enabled' ? '停用' : '启用'}
                </Button>
              </div>
            ),
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '清单条数', value: String(listQuery.data?.total ?? 0) },
            { label: '本页强制', value: String(rows.filter((row) => row.slsiRequired).length) },
            { label: '本页阻断', value: String(rows.filter((row) => row.blockCreate).length) },
            { label: '证书数', value: String(certsQuery.data?.length ?? 0) },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            {['全部', '启用', '停用'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={slsiFilter}
            onChange={(event) => {
              setSlsiFilter(event.target.value)
              setPage(1)
            }}
          >
            {['全部', '强制', '非强制'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={blockFilter}
            onChange={(event) => {
              setBlockFilter(event.target.value)
              setPage(1)
            }}
          >
            {['全部', '阻断', '不阻断'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={downloadTemplate}>
            下载导入模板
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importing}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                try {
                  setImporting(true)
                  const parsed = await parseImportRows(file)
                  if (parsed.length === 0) {
                    setImporting(false)
                    showErr('文件中没有可导入的数据行')
                    return
                  }
                  importMutation.mutate({ rows: parsed })
                } catch (error) {
                  setImporting(false)
                  showErr(error instanceof Error ? error.message : '解析文件失败')
                }
              }}
            />
            <Button size="sm" variant="outline" asChild disabled={importing}>
              <span>{importing ? '导入中…' : '导入 Excel/CSV'}</span>
            </Button>
          </label>
          <Button size="sm" variant="outline" onClick={() => setCertOpen(true)}>
            上传证书
          </Button>
        </div>
        {notice ? (
          <p role="status" className={`text-sm ${noticeError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {notice}
          </p>
        ) : null}
      </UedWorkspace>

      <div className="space-y-2">
        <h3 className="text-base font-semibold">商品证书</h3>
        <p className="text-sm text-muted-foreground">有效且未过期的证书可解除对应商品的建档/上架阻断。也可在商品详情页维护。</p>
        {(certsQuery.data ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            暂无证书。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>证书编号</TableHead>
                <TableHead>证书名称</TableHead>
                <TableHead>HS</TableHead>
                <TableHead>有效期至</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>文件</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(certsQuery.data ?? []).map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell>
                    {cert.productSpu} · {cert.productName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{cert.variantSku || 'SPU 级'}</TableCell>
                  <TableCell className="font-mono text-xs">{cert.certNumber}</TableCell>
                  <TableCell>{cert.certName || '—'}</TableCell>
                  <TableCell>{cert.hsCode || '—'}</TableCell>
                  <TableCell>
                    {formatDate(cert.expiresAt)}
                    {cert.expired ? <Badge variant="destructive">已过期</Badge> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cert.status === 'enabled' ? 'secondary' : 'outline'}>
                      {cert.status === 'enabled' ? '启用' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {cert.fileUrl ? (
                      <a className="text-sm underline" href={cert.fileUrl} target="_blank" rel="noreferrer">
                        {cert.fileName || '查看'}
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        certStatusMutation.mutate({
                          id: cert.id,
                          status: cert.status === 'enabled' ? 'disabled' : 'enabled',
                        })
                      }
                    >
                      {cert.status === 'enabled' ? '停用' : '启用'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {createOpen ? (
        <UedDialog
          title="新增 HS 规则"
          description="保存后立即生效。命中强制认证且勾选阻断时，无有效证书的商品建档和本地上架会被拒绝。"
          fields={ruleFields()}
          onClose={() => setCreateOpen(false)}
          onSave={(values) =>
            createMutation.mutate({
              hsCode: values.hsCode,
              description: values.description,
              slsiRequired: values.slsiRequired === '是',
              certName: values.certName,
              blockCreate: values.blockCreate === '是',
              validFrom: values.validFrom || null,
              validTo: values.validTo || null,
              status: values.status === '停用' ? 'disabled' : 'enabled',
              notes: values.notes,
            })
          }
          saveLabel={createMutation.isPending ? '保存中…' : '保存'}
        />
      ) : null}

      {editing ? (
        <UedDialog
          title={`编辑 HS ${editing.hsCode}`}
          description="修改编码时若与已有记录冲突会失败，不会静默覆盖。"
          fields={ruleFields(editing)}
          onClose={() => setEditingId(null)}
          onSave={(values) =>
            updateMutation.mutate({
              id: editing.id,
              hsCode: values.hsCode,
              description: values.description,
              slsiRequired: values.slsiRequired === '是',
              certName: values.certName,
              blockCreate: values.blockCreate === '是',
              validFrom: values.validFrom || null,
              validTo: values.validTo || null,
              status: values.status === '停用' ? 'disabled' : 'enabled',
              notes: values.notes,
            })
          }
          saveLabel={updateMutation.isPending ? '保存中…' : '保存'}
        />
      ) : null}

      {certOpen ? (
        <UedDialog
          title="上传商品证书"
          description="证书挂在 SPU 上，可选覆盖到某个 SKU。有效且未过期时可解除阻断。"
          fields={[
            {
              key: 'productId',
              label: '商品 SPU',
              required: true,
              options: productOptions.length > 0 ? productOptions : [{ value: '', title: '暂无商品，请先建档' }],
            },
            { key: 'certNumber', label: '证书编号', required: true },
            { key: 'certName', label: '证书名称' },
            { key: 'hsCode', label: '对应 HS', placeholder: '可空，默认按商品 HS 匹配' },
            { key: 'expiresAt', label: '有效期至', type: 'date' },
            { key: 'notes', label: '备注', type: 'textarea', fullWidth: true },
          ]}
          onClose={() => {
            setCertOpen(false)
            setCertFile(null)
          }}
          onSave={(values) => {
            if (!values.productId) {
              showErr('请选择商品')
              return
            }
            upsertCertMutation.mutate({
              productId: values.productId,
              certNumber: values.certNumber,
              certName: values.certName,
              hsCode: values.hsCode,
              expiresAt: values.expiresAt || null,
              notes: values.notes,
              fileName: certFile?.name,
              fileUrl: certFile?.url,
            })
          }}
          saveLabel={upsertCertMutation.isPending ? '保存中…' : '保存证书'}
        >
          <div className="space-y-1">
            <p className="text-sm font-medium">证书文件（PDF 或图片，最大 5MB）</p>
            <Input
              type="file"
              accept=".pdf,image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  setCertFile(null)
                  return
                }
                if (file.size > 5 * 1024 * 1024) {
                  showErr('证书文件不能超过 5MB')
                  event.target.value = ''
                  return
                }
                const reader = new FileReader()
                reader.onload = () => {
                  setCertFile({ name: file.name, url: String(reader.result ?? '') })
                }
                reader.readAsDataURL(file)
              }}
            />
            {certFile ? <p className="text-xs text-muted-foreground">已选择 {certFile.name}</p> : null}
          </div>
        </UedDialog>
      ) : null}
    </div>
  )
}
