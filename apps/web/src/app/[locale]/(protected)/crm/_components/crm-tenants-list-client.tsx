"use client"

import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { LocaleLink } from "@/lib/i18n/navigation"
import { normalizeAppRole } from "@/lib/auth/app-role"
import { authClient } from "@/lib/auth-client"
import { trpc } from "@/lib/trpc/client"
import { IconPlus, IconSearch, IconUpload } from "@tabler/icons-react"
import { CalendarOff, Eye, MoreHorizontal } from "lucide-react"
import { CrmTenantImportDialog } from "./crm-tenant-import-dialog"
import { CrmPlatformTenantImportDialog } from "./crm-platform-tenant-import-dialog"
import { CrmTenantRechargeBalanceQueryDialog } from "./crm-tenant-recharge-balance-query-dialog"
import { CrmTenantIdQueryDialog } from "./crm-tenant-id-query-dialog"
import {
  CrmTenantInternalSettingDialog,
  type TenantInternalSettingTarget,
} from "./crm-tenant-internal-setting-dialog"
import type { BillingTenantListItem } from "@/lib/types/billing-tenant"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { ListPagination } from "@/components/shared/list-pagination"

const ALL_TYPE = "all" as const
const ALL_MERCHANT = "all" as const
const PAGE_SIZE = 20
type TenantTypeFilter = typeof ALL_TYPE | BillingTenantListItem["type"]

function formatMoney(n: number) {
  return `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateTime(iso?: string) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false })
  } catch {
    return iso
  }
}

/** 列表展示：遮挡手机号中间 4 位，如 13812345678 → 138****5678 */
function maskPhoneMiddle(raw?: string | null): string {
  if (!raw?.trim()) return "—"
  const digits = raw.replace(/\D/g, "")
  const local =
    digits.length === 13 && digits.startsWith("86")
      ? digits.slice(2)
      : digits.length >= 11
        ? digits.slice(-11)
        : digits
  if (local.length === 11) {
    const prefix =
      digits.length === 13 && digits.startsWith("86") ? "+86 " : ""
    return `${prefix}${local.slice(0, 3)}****${local.slice(7)}`
  }
  if (digits.length >= 7) {
    const start = Math.floor((digits.length - 4) / 2)
    return `${digits.slice(0, start)}****${digits.slice(start + 4)}`
  }
  return raw.trim()
}

function formatTenantType(type: "internal" | "external") {
  return type === "internal" ? "内部租户" : "外部租户"
}

function formatInternalExclusionSummary(t: BillingTenantListItem) {
  if (t.type !== "internal") return null
  if (!t.internalEffectiveFrom && !t.internalEffectiveTo) return "全历史排除"
  const from = t.internalEffectiveFrom ?? "…"
  const to = t.internalEffectiveTo ?? "…"
  return `${from}～${to}`
}

export function CrmTenantsListClient() {
  const { data: session } = authClient.useSession()
  const appRole = normalizeAppRole(session?.user?.role)
  const isAdmin = appRole === "admin"
  const canQueryTenantId = appRole === "admin" || appRole === "user"

  const utils = trpc.useUtils()
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<TenantTypeFilter>(ALL_TYPE)
  /** 空字符串表示尚未根据共绩默认商户初始化 */
  const [merchantFilter, setMerchantFilter] = React.useState<string>("")
  const [page, setPage] = React.useState(1)
  const [platformImportOpen, setPlatformImportOpen] = React.useState(false)
  const [excelImportOpen, setExcelImportOpen] = React.useState(false)
  const [rechargeBalanceQueryOpen, setRechargeBalanceQueryOpen] = React.useState(false)
  const [tenantIdQueryOpen, setTenantIdQueryOpen] = React.useState(false)
  const [internalSettingTenant, setInternalSettingTenant] =
    React.useState<TenantInternalSettingTarget | null>(null)

  const { data: merchants = [] } = trpc.merchant.list.useQuery(undefined, {
    placeholderData: (prev) => prev,
  })

  const gongjiMerchantId = React.useMemo(
    () => merchants.find((m) => m.platformMerchantId === 0)?.id,
    [merchants],
  )

  React.useEffect(() => {
    if (merchantFilter) return
    if (gongjiMerchantId) {
      setMerchantFilter(gongjiMerchantId)
      return
    }
    if (merchants.length > 0) {
      setMerchantFilter(ALL_MERCHANT)
    }
  }, [gongjiMerchantId, merchantFilter, merchants.length])

  React.useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  React.useEffect(() => {
    setPage(1)
  }, [search, typeFilter, merchantFilter])

  const merchantIdForQuery =
    !merchantFilter || merchantFilter === ALL_MERCHANT ? undefined : merchantFilter

  const { data, isLoading, isFetching } = trpc.crm.tenants.list.useQuery(
    {
      search: search || undefined,
      type: typeFilter === ALL_TYPE ? undefined : typeFilter,
      merchantId: merchantIdForQuery,
      page,
      pageSize: PAGE_SIZE,
    },
    {
      enabled: Boolean(merchantFilter),
      placeholderData: (prev) => prev,
    },
  )

  const tenants = data?.items ?? []
  const totalItems = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const onImportSuccess = React.useCallback(() => {
    void utils.crm.tenants.list.invalidate()
  }, [utils])

  return (
    <div className="bg-background p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>计费租户</CardTitle>
            <CardDescription>
              平台计费账户与客户关联
              {isAdmin ? "；支持 Excel 批量导入" : ""}（共 {totalItems} 条
              {isFetching && !isLoading ? "，刷新中…" : ""}）
            </CardDescription>
          </div>
          {isAdmin || canQueryTenantId ? (
            <div className="flex flex-wrap gap-2">
              {isAdmin ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    type="button"
                    onClick={() => setPlatformImportOpen(true)}
                  >
                    <IconPlus className="size-4" />
                    导入租户
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    type="button"
                    onClick={() => setExcelImportOpen(true)}
                  >
                    <IconUpload className="size-4" />
                    导入 Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    type="button"
                    onClick={() => setRechargeBalanceQueryOpen(true)}
                  >
                    <IconSearch className="size-4" />
                    充值余额查询
                  </Button>
                </>
              ) : null}
              {canQueryTenantId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  type="button"
                  onClick={() => setTenantIdQueryOpen(true)}
                >
                  <IconSearch className="size-4" />
                  租户ID查询
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="搜索：平台租户ID / 租户名 / 手机号 / 客户名"
              className="max-w-md"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Select
              value={merchantFilter || undefined}
              onValueChange={setMerchantFilter}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="所属商户" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MERCHANT}>全部商户</SelectItem>
                {merchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.platformMerchantId === 0 ? "（默认）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TenantTypeFilter)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="租户类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPE}>全部类型</SelectItem>
                <SelectItem value="internal">内部租户</SelectItem>
                <SelectItem value="external">外部租户</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台租户ID</TableHead>
                  <TableHead>租户名</TableHead>
                  <TableHead>所属商户</TableHead>
                  <TableHead>租户类型</TableHead>
                  <TableHead>租户手机</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead className="text-right">余额</TableHead>
                  <TableHead>欠费时间</TableHead>
                  <TableHead>平台注册时间</TableHead>
                  <TableHead className="text-right">授信额度</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-12">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || !merchantFilter ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-muted-foreground py-8 text-center text-sm">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : tenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-muted-foreground py-8 text-center text-sm">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm">{t.platformTenantId ?? "—"}</TableCell>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>
                        <LocaleLink
                          href={`/merchant/${t.merchantId}`}
                          className="text-primary hover:underline"
                        >
                          {t.merchantName}
                        </LocaleLink>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span>{formatTenantType(t.type)}</span>
                        {formatInternalExclusionSummary(t) ? (
                          <span className="text-muted-foreground block text-xs">
                            {formatInternalExclusionSummary(t)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{maskPhoneMiddle(t.phone)}</TableCell>
                      <TableCell>
                        <LocaleLink
                          href={`/crm/customers/${t.customerId}`}
                          className="text-primary hover:underline"
                        >
                          {t.customerName}
                        </LocaleLink>
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.contactPerson || "—"}
                        {t.contactPhone ? (
                          <span className="text-muted-foreground block text-xs">
                            {maskPhoneMiddle(t.contactPhone)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(t.balance)}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(t.overdueAt)}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(t.platformRegisteredAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.creditLimit != null ? formatMoney(t.creditLimit) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-auto whitespace-nowrap mr-2 ml-2">
                            <DropdownMenuItem asChild>
                              <LocaleLink href={`/crm/tenants/${t.id}`}>
                                <Eye className="size-4" />
                                查看详情
                              </LocaleLink>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setInternalSettingTenant(t)}>
                              <CalendarOff className="size-4" />
                              收入排除设置
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <ListPagination
            page={safePage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="border-t-0 px-0"
          />
        </CardContent>
      </Card>

      {isAdmin && platformImportOpen ? (
        <CrmPlatformTenantImportDialog
          open
          onOpenChange={setPlatformImportOpen}
          onSuccess={onImportSuccess}
        />
      ) : null}
      {isAdmin && excelImportOpen ? (
        <CrmTenantImportDialog
          open
          onOpenChange={setExcelImportOpen}
          onSuccess={onImportSuccess}
        />
      ) : null}
      {isAdmin && rechargeBalanceQueryOpen ? (
        <CrmTenantRechargeBalanceQueryDialog
          open
          onOpenChange={setRechargeBalanceQueryOpen}
          onImported={onImportSuccess}
        />
      ) : null}
      {canQueryTenantId && tenantIdQueryOpen ? (
        <CrmTenantIdQueryDialog open onOpenChange={setTenantIdQueryOpen} />
      ) : null}

      <CrmTenantInternalSettingDialog
        open={internalSettingTenant != null}
        onOpenChange={(open) => {
          if (!open) setInternalSettingTenant(null)
        }}
        tenant={internalSettingTenant}
        onUpdated={() => {
          void utils.crm.tenants.list.invalidate()
        }}
      />
    </div>
  )
}
