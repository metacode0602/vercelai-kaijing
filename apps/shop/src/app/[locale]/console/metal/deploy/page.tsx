"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/navigation"
import { SegmentedControl } from "@/components/segmented-control"
import { trpc } from "@/trpc/client"
import {
  COMPUTE_VOUCHERS,
  getComputeVoucherDeduction,
  isComputeVoucherApplicable,
} from "@/lib/server-market-data"
import {
  formatMetalAvailability,
  formatMetalCNY,
  getMetalBillingHighlightLabel,
  getMetalDeployPrice,
  getMetalEnvTemplateById,
  getMetalRentalDurationLabel,
  getMaxRentalDuration,
  METAL_BILLING_OPTIONS,
  METAL_ENV_TEMPLATES,
  metalBillingToVoucherBilling,
  NETWORK_MODE_LABELS,
  rentalDurationToHours,
  validateMetalRentalDuration,
  type MetalBillingMethod,
} from "@/lib/metal-market-data"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { MetalDeployActionBar } from "./_components/metal-deploy-action-bar"
import { MetalVoucherSelect } from "./_components/metal-voucher-select"
import { cn } from "@/lib/utils"

const MOCK_BALANCE = 5000

function parseBilling(value: string | null): MetalBillingMethod {
  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value
  }
  return "hourly"
}

function getMetalOrderBillingUnit(billing: MetalBillingMethod): "hour" | "day" | "week" | "month" {
  switch (billing) {
    case "daily":
      return "day"
    case "weekly":
      return "week"
    case "monthly":
      return "month"
    default:
      return "hour"
  }
}

export default function MetalDeployPage() {
  const router = useLocaleRouter()
  const searchParams = useSearchParams()

  const deviceId = searchParams.get("device")
  const { data: device, isLoading: deviceLoading } = trpc.metal.deviceGetById.useQuery(
    { id: deviceId ?? "" },
    { enabled: !!deviceId },
  )

  const createOrderMutation = trpc.metal.orderCreate.useMutation({
    onSuccess: (data) => {
      toast.success("裸金属租用请求已提交")
      router.push(`/console/metal/instances/${data.orderId}?new=1`)
    },
    onError: (error) => {
      toast.error(`下单失败: ${error.message}`)
      setSubmitting(false)
    },
  })

  const [billing, setBilling] = useState<MetalBillingMethod>(
    parseBilling(searchParams.get("billing")),
  )
  const [deviceCount, setDeviceCount] = useState(1)
  const [rentalDuration, setRentalDuration] = useState(1)
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null)
  const [autoRenew, setAutoRenew] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 环境模板
  const [envTemplateId, setEnvTemplateId] = useState<string>(METAL_ENV_TEMPLATES[3].id)

  // SSH access
  const [sshEnabled, setSshEnabled] = useState(true)
  const [sshKey, setSshKey] = useState("")
  const [ports, setPorts] = useState("22")

  // Agreement
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [termsDialogOpen, setTermsDialogOpen] = useState(false)

  const selectedTemplate = getMetalEnvTemplateById(envTemplateId) ?? METAL_ENV_TEMPLATES[3]

  const unitPrice = useMemo(
    () => (device ? getMetalDeployPrice(device, billing) : { amount: 0, unit: "时" }),
    [billing, device],
  )

  const rentalDurationLabel = getMetalRentalDurationLabel(billing)

  const maxRentalDuration = useMemo(
    () => (device ? getMaxRentalDuration(device, billing) : 0),
    [billing, device],
  )

  const rentalValidation = useMemo(
    () =>
      device
        ? validateMetalRentalDuration(device, billing, rentalDuration)
        : { valid: false, rentalHours: 0, maxDuration: 0, message: "" },
    [billing, device, rentalDuration],
  )

  const totalAmount = unitPrice.amount * deviceCount * rentalDuration

  const selectedVoucher =
    COMPUTE_VOUCHERS.find((voucher) => voucher.id === selectedVoucherId) ?? null

  const voucherBilling = metalBillingToVoucherBilling(billing)

  const { deduction: voucherDeduction } = useMemo(
    () =>
      getComputeVoucherDeduction(
        selectedVoucher,
        { amount: totalAmount, unit: unitPrice.unit },
        device?.pricing.hourly ?? 0,
      ),
    [device?.pricing.hourly, selectedVoucher, totalAmount, unitPrice.unit],
  )

  const payableAmount = Math.max(0, totalAmount - voucherDeduction)

  useEffect(() => {
    if (
      selectedVoucher &&
      !isComputeVoucherApplicable(selectedVoucher, voucherBilling, totalAmount)
    ) {
      setSelectedVoucherId(null)
    }
  }, [selectedVoucher, totalAmount, voucherBilling])

  useEffect(() => {
    if (device) {
      setDeviceCount((prev) => Math.min(Math.max(1, prev), device.stock))
    }
  }, [device])

  useEffect(() => {
    if (!device) return
    const max = getMaxRentalDuration(device, billing)
    setRentalDuration((prev) => {
      if (max <= 0) return 1
      return Math.min(Math.max(1, prev), max)
    })
  }, [billing, device])

  if (deviceLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 text-center">
        <h1 className="mb-2 text-2xl font-bold">加载中...</h1>
        <p className="mb-6 text-sm text-muted-foreground">正在获取设备信息</p>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 text-center">
        <h1 className="mb-2 text-2xl font-bold">未选择设备</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          请从裸金属列表选择规格后再进入租用流程。
        </p>
        <Button asChild>
          <LocaleLink href="/metal/list">返回裸金属列表</LocaleLink>
        </Button>
      </div>
    )
  }

  const activeDevice = device

  const canSubmit =
    activeDevice.stock > 0 &&
    deviceCount > 0 &&
    deviceCount <= activeDevice.stock &&
    rentalValidation.valid &&
    maxRentalDuration > 0 &&
    (payableAmount === 0 || MOCK_BALANCE >= payableAmount) &&
    agreedToTerms

  function handleDeviceCountChange(raw: string) {
    const next = Number(raw)
    if (Number.isNaN(next)) return
    setDeviceCount(Math.min(Math.max(1, next), activeDevice.stock))
  }

  function handleRentalDurationChange(raw: string) {
    const next = Number(raw)
    if (Number.isNaN(next)) return
    if (maxRentalDuration <= 0) {
      setRentalDuration(1)
      return
    }
    setRentalDuration(Math.min(Math.max(1, next), maxRentalDuration))
  }

  function handleSubmit() {
    if (!canSubmit) return

    if (!activeDevice.dataCenterId || !activeDevice.gpuCardTypeId) {
      toast.error("设备缺少下单信息，请刷新后重试")
      return
    }

    setSubmitting(true)
    createOrderMutation.mutate({
      dataCenterId: activeDevice.dataCenterId,
      gpuCardTypeId: activeDevice.gpuCardTypeId,
      description: `metal-${activeDevice.gpuModelKey.toLowerCase().replace(/\s+/g, "-")}-${activeDevice.region}`,
      billingUnit: getMetalOrderBillingUnit(billing),
      deviceCount,
      gpuCount: activeDevice.gpuCount,
      unitPricePerCardHour: activeDevice.pricing.hourly / activeDevice.gpuCount,
      durationHours: rentalDurationToHours(billing, rentalDuration),
      couponId: selectedVoucherId ?? undefined,
      autoRenew,
      sshEnabled,
      sshPublicKey: sshKey || undefined,
      envTemplateId,
      ports,
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none pb-4">
        <div className="container mx-auto px-4 pt-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <LocaleLink href="/console/metal/list">裸金属短租</LocaleLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>确认租用</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <Alert className="border-destructive/30 bg-destructive/5 py-2 lg:max-w-xl">
              <AlertTriangle className="text-destructive" />
              <AlertDescription className="text-xs text-muted-foreground">
                严禁使用裸金属设备进行挖矿、生成违禁内容、攻击他人网络等违法违规行为。一经发现将立即封号并保留追究法律责任的权利。
              </AlertDescription>
            </Alert>
          </div>

          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div>
                <h2 className="text-lg font-semibold">{activeDevice.displayName}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeDevice.region} · {NETWORK_MODE_LABELS[activeDevice.networkMode]} ·{" "}
                  {activeDevice.gpuCount} GPU · CUDA Max {activeDevice.maxCuda} · 驱动{" "}
                  {activeDevice.driverVersion}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatMetalAvailability(activeDevice.availableUntil, activeDevice.availableHours)}
                </p>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">vCPU</span>
                  <p className="font-semibold">{activeDevice.vcpu} 核心</p>
                </div>
                <div>
                  <span className="text-muted-foreground">内存</span>
                  <p className="font-semibold">{activeDevice.memoryGb} GB</p>
                </div>
                <div>
                  <span className="text-muted-foreground">系统盘</span>
                  <p className="font-semibold">{activeDevice.systemDiskGb} GB</p>
                </div>
                <div>
                  <span className="text-muted-foreground">数据盘</span>
                  <p className="font-semibold">{activeDevice.dataDiskGb} GB</p>
                </div>
              </div>
            </Card>
          </section>

          {/* 预装环境 */}
          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div>
                <Label className="text-sm font-bold">预装环境</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  物理机已预装 Ubuntu 24.04 + NVIDIA 驱动 + CUDA runtime，以下为可选的软件环境预装。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {METAL_ENV_TEMPLATES.map((template) => {
                  const selected = envTemplateId === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setEnvTemplateId(template.id)}
                      className={cn(
                        "relative flex flex-col items-start rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:shadow-sm",
                        selected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border",
                      )}
                    >
                      {selected && (
                        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          ✓
                        </span>
                      )}
                      <span className={cn("text-sm font-semibold", selected && "text-primary")}>
                        {template.label}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        {template.description}
                      </span>
                      {template.packages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.packages.map((pkg) => (
                            <span
                              key={pkg}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {pkg}
                            </span>
                          ))}
                        </div>
                      )}
                      {template.setupMinutes > 0 && (
                        <span className="mt-2 text-[10px] text-muted-foreground">
                          预计安装 {template.setupMinutes} 分钟
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>
          </section>

          {/* SSH 配置 */}
          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <Label className="w-24 shrink-0 pt-1 text-sm font-bold">SSH:</Label>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <span className="text-primary">⚡</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">启用 SSH</p>
                        <p className="text-xs text-muted-foreground">
                          启用 SSH 远程连接，部署后可使用公钥登录实例终端
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={sshEnabled}
                      onCheckedChange={setSshEnabled}
                    />
                  </div>

                  {sshEnabled && (
                    <div className="space-y-1.5 sm:max-w-lg">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-sm font-medium">
                          SSH 公钥
                        </Label>
                      </div>
                      <Textarea
                        value={sshKey}
                        onChange={(e) => setSshKey(e.target.value)}
                        placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1... user@host"
                        rows={3}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        粘贴公钥（如 <code className="rounded bg-muted px-1">~/.ssh/id_ed25519.pub</code>），
                        部署后可使用 <code className="rounded bg-muted px-1">ssh root@&lt;ip&gt;</code> 连接。
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <Label className="w-24 shrink-0 pt-1 text-sm font-bold">暴露端口:</Label>
                <div className="w-full space-y-1.5 sm:max-w-lg">
                  <Input
                    value={ports}
                    onChange={(e) => setPorts(e.target.value)}
                    placeholder="22,8080"
                  />
                  <p className="text-xs text-muted-foreground">
                    HTTP/TCP 端口，逗号分隔。常用 22（SSH）、8080（WebUI）。
                  </p>
                </div>
              </div>
            </Card>
          </section>

          {/* 计费与租用 */}
          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Label className="w-24 shrink-0 text-sm font-bold">计费方式:</Label>
                <SegmentedControl
                  options={METAL_BILLING_OPTIONS}
                  value={billing}
                  onChange={setBilling}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                当前租用：{getMetalBillingHighlightLabel(billing)}，单价{" "}
                {formatMetalCNY(unitPrice.amount)}/{unitPrice.unit}。预付费，下单即扣费，租期内关机不退费。
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-bold">设备数量</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={activeDevice.stock}
                      value={deviceCount}
                      onChange={(e) => handleDeviceCountChange(e.target.value)}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">
                      台（库存 {activeDevice.stock}）
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-bold">租用数量</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={maxRentalDuration > 0 ? maxRentalDuration : 1}
                      value={rentalDuration}
                      onChange={(e) => handleRentalDurationChange(e.target.value)}
                      className="w-28"
                      aria-invalid={!rentalValidation.valid}
                    />
                    <span className="text-sm text-muted-foreground">
                      {rentalDurationLabel}
                      {maxRentalDuration > 0 && `（最多 ${maxRentalDuration}）`}
                    </span>
                  </div>
                  {!rentalValidation.valid && rentalValidation.message && (
                    <p className="text-xs text-destructive">{rentalValidation.message}</p>
                  )}
                  {rentalValidation.valid && rentalValidation.rentalHours > 0 && (
                    <p className="text-xs text-muted-foreground">
                      合计租用 {rentalValidation.rentalHours} 小时，未超出可用时段
                    </p>
                  )}
                </div>
              </div>

              <MetalVoucherSelect
                billing={voucherBilling}
                priceAmount={totalAmount}
                value={selectedVoucherId}
                onChange={setSelectedVoucherId}
              />

              <label className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3">
                <Checkbox
                  checked={autoRenew}
                  onCheckedChange={(checked) => setAutoRenew(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">自动续租</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    租期到期前自动下单续租，费用从账户余额扣除。余额不足时将不再续租，设备到期自动释放。
                  </span>
                </span>
              </label>
            </Card>
          </section>

          {/* 使用协议 */}
          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">我已阅读并同意</span>{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setTermsDialogOpen(true)}
                  >
                    《裸金属服务使用协议》
                  </button>
                  <span className="text-muted-foreground">和</span>{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setTermsDialogOpen(true)}
                  >
                    《禁止用途声明》
                  </button>
                </span>
              </label>
            </Card>
          </section>
        </div>
      </div>

      <MetalDeployActionBar
        region={activeDevice.region}
        gpuLabel={`${activeDevice.gpuModelKey} · ${activeDevice.gpuCount} GPU`}
        networkModeLabel={NETWORK_MODE_LABELS[activeDevice.networkMode]}
        deviceCount={deviceCount}
        rentalDuration={rentalDuration}
        rentalDurationLabel={rentalDurationLabel}
        priceAmount={unitPrice.amount}
        priceUnit={unitPrice.unit}
        totalAmount={totalAmount}
        voucherDeduction={voucherDeduction}
        payableAmount={payableAmount}
        balance={MOCK_BALANCE}
        availabilityError={
          !rentalValidation.valid ? rentalValidation.message : undefined
        }
        canSubmit={canSubmit}
        submitting={submitting}
        onCancel={() => router.push("/metal/list")}
        onSubmit={handleSubmit}
      />

      {/* 使用协议弹窗 */}
      <AlertDialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen}>
        <AlertDialogContent className="max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>裸金属服务使用协议</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">1. 服务说明</strong>
              <br />
              裸金属短租服务为您提供独占物理服务器的 GPU 算力资源。设备一经租用，您将获得 root 权限的完整访问能力。
            </p>
            <p>
              <strong className="text-foreground">2. 预付费计费规则</strong>
              <br />
              裸金属为预付费产品，费用在下单时一次性收取。支持按小时、包天、包周、包月四种租用方式。租期内关机不退还剩余时长费用，开机不额外计费。
            </p>
            <p>
              <strong className="text-foreground">3. 提前释放</strong>
              <br />
              包月/包周租用可申请提前释放，按剩余时长比例退还费用（包月退 50%、包周退 30%）。按小时租用及短租（≤24小时）不支持退款。
            </p>
            <p>
              <strong className="text-foreground">4. 自动续租</strong>
              <br />
              开启自动续租后，到期前将自动下单续租，费用从账户余额扣除。余额不足时自动停止续租，设备到期释放。
            </p>
            <p>
              <strong className="text-foreground">5. 数据安全</strong>
              <br />
              设备释放后所有数据将被清除且不可恢复。请及时备份重要数据。
            </p>
            <p>
              <strong className="text-foreground">6. 禁止用途</strong>
              <br />
              严禁使用本服务进行以下活动：
            </p>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>加密货币挖矿</li>
              <li>生成、传播或存储违法违规内容</li>
              <li>网络攻击、扫描、渗透测试（未经授权）</li>
              <li>违反中国法律法规的任何活动</li>
              <li>违反服务提供商网络使用政策的行为</li>
            </ul>
            <p>
              违反上述规定将立即封号、终止服务且不退还任何费用，并保留追究法律责任的权利。
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setAgreedToTerms(true)
              setTermsDialogOpen(false)
            }}>
              我已阅读并同意
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
