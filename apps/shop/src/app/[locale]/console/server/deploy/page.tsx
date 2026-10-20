"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/navigation"
import { useStore } from "@/components/console-store"
import {
  COMPUTE_VOUCHERS,
  DEPLOY_BILLING_OPTIONS,
  DISK_EXPAND_RATE_PER_GB_DAY,
  GPU_COUNT_OPTIONS,
  getComputeVoucherDeduction,
  getDeployPrice,
  getOfferingById,
  isComputeVoucherApplicable,
  parseBillingMethod,
  toDeployBilling,
  type DeployBillingMethod,
} from "@/lib/server-market-data"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Card } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { DeployActionBar } from "./_components/deploy-action-bar"
import {
  EnvFeedbackDialog,
  EnvFeedbackLink,
} from "./_components/env-feedback-dialog"
import { ImageSelector } from "./_components/image-selector"
import { InstanceSummaryCard } from "./_components/instance-summary-card"
import { S3VolumeMount } from "./_components/s3-volume-mount"
import { SegmentedControl } from "@/components/segmented-control"
import {
  filterOptionActive,
  filterOptionInactive,
} from "../_components/theme-styles"
import { cn } from "@/lib/utils"
import { SshAccessStep, type SshAccessValues } from "./_components/ssh-access-step"

const MOCK_BALANCE = 10000

export default function ServerDeployPage() {
  const router = useLocaleRouter()
  const searchParams = useSearchParams()
  const { volumes, addServerInstance } = useStore()

  const offeringId = searchParams.get("offering") ?? "cpu-sichuan"
  const initialBilling = toDeployBilling(parseBillingMethod(searchParams.get("billing")))
  const initialGpuCount = Number(searchParams.get("gpuCount") ?? "1")

  const offering = getOfferingById(offeringId) ?? getOfferingById("cpu-sichuan")!

  const [billing, setBilling] = useState<DeployBillingMethod>(initialBilling)
  const [gpuCount, setGpuCount] = useState(
    GPU_COUNT_OPTIONS.includes(initialGpuCount as (typeof GPU_COUNT_OPTIONS)[number])
      ? initialGpuCount
      : offering.gpuCount,
  )
  const [diskExpandEnabled, setDiskExpandEnabled] = useState(false)
  const [extraDiskGb, setExtraDiskGb] = useState(1)
  const [fullImageRef, setFullImageRef] = useState("")
  const [imageLabel, setImageLabel] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [envFeedbackOpen, setEnvFeedbackOpen] = useState(false)
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null)
  const [volumeId, setVolumeId] = useState("none")
  const [sshAccess, setSshAccess] = useState<SshAccessValues>({
    sshEnabled: true,
    sshKey: "",
    ports: "8888,22",
  })

  const totalDiskGb = offering.dataDiskGb + (diskExpandEnabled ? extraDiskGb : 0)

  const price = useMemo(
    () => getDeployPrice(offering, billing),
    [billing, offering],
  )

  const selectedVoucher =
    COMPUTE_VOUCHERS.find((voucher) => voucher.id === selectedVoucherId) ?? null

  const { deduction: voucherDeduction, summary: voucherSummary } = useMemo(
    () =>
      getComputeVoucherDeduction(
        selectedVoucher,
        price,
        offering.pricing.hourly,
      ),
    [offering.pricing.hourly, price, selectedVoucher],
  )

  const payableAmount = Math.max(0, price.amount - voucherDeduction)

  useEffect(() => {
    if (
      selectedVoucher &&
      !isComputeVoucherApplicable(selectedVoucher, billing, price.amount)
    ) {
      setSelectedVoucherId(null)
    }
  }, [billing, price.amount, selectedVoucher])

  const canSubmit = useMemo(() => {
    if (!offering.inStock) return false
    if (billing === "voucher") return true
    if (price.unit !== "时") return true
    return payableAmount === 0 || MOCK_BALANCE >= payableAmount
  }, [billing, offering.inStock, payableAmount, price.unit])

  const dataDiskLabel = diskExpandEnabled
    ? `免费 ${offering.dataDiskGb} GB + 扩容 ${extraDiskGb} GB`
    : `免费 ${offering.dataDiskGb} GB`

  function updateSshAccess<K extends keyof SshAccessValues>(
    key: K,
    value: SshAccessValues[K],
  ) {
    setSshAccess((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    if (!canSubmit) return

    setSubmitting(true)
    window.setTimeout(() => {
      const inst = addServerInstance({
        name: `${imageLabel.toLowerCase() || "image"}-${offering.region}`,
        offeringId: offering.id,
        billing,
        gpuCount,
        diskExpandEnabled,
        extraDiskGb,
        volumeId: volumeId === "none" ? null : volumeId,
        imageId: fullImageRef,
        imageVersion: fullImageRef,
        sshEnabled: sshAccess.sshEnabled,
        sshKey: sshAccess.sshKey,
        ports: sshAccess.ports,
      })
      setSubmitting(false)
      toast.success("实例创建请求已提交")
      router.push(`/console/server/instances/${inst.id}?new=1`)
    }, 800)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none">
        <div className="container mx-auto px-4 pt-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <LocaleLink href="/console/server/list">算力市场</LocaleLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>创建实例</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <Alert className="border-border bg-muted/50 py-2 lg:max-w-xl">
              <AlertTriangle className="text-muted-foreground" />
              <AlertDescription className="text-xs text-muted-foreground">
                严禁使用 WebUI 等算法生成违禁图片、严禁挖矿，一经发现立即封号！
              </AlertDescription>
            </Alert>
          </div>

          <section className="mb-6">
            <InstanceSummaryCard offering={offering} billing={billing} />
          </section>

          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Label className="w-24 shrink-0 text-sm font-bold">计费方式:</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    options={DEPLOY_BILLING_OPTIONS}
                    value={billing}
                    onChange={setBilling}
                  />
                  <button type="button" className="text-sm text-primary hover:underline">
                    计费规则
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                创建完主机后仍然可以转换计费方式。如选择按量计费，价格发生变动以实例开机时的价格为准
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Label className="w-24 shrink-0 text-sm font-bold">GPU数量:</Label>
                <div className="flex flex-wrap gap-2">
                  {GPU_COUNT_OPTIONS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setGpuCount(count)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        gpuCount === count ? filterOptionActive : filterOptionInactive,
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <Label className="w-24 shrink-0 pt-1 text-sm font-bold">数据盘:</Label>
                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">总容量：</span>
                    <span className="font-semibold">{totalDiskGb} GB</span>
                    <span className="text-muted-foreground">
                      {" "}
                      （免费 {offering.dataDiskGb} GB
                      {diskExpandEnabled ? ` + 扩容 ${extraDiskGb} GB` : ""}）
                    </span>
                  </div>

                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={diskExpandEnabled}
                      onCheckedChange={(checked) => setDiskExpandEnabled(checked === true)}
                      className="mt-0.5"
                    />
                    <span>
                      启用扩容
                      {offering.expandableDiskGb != null && (
                        <span className="text-muted-foreground">
                          {" "}
                          （最少 1 GB，上限 {offering.expandableDiskGb} GB，单价{" "}
                          {DISK_EXPAND_RATE_PER_GB_DAY} 元 / GB / 日）
                        </span>
                      )}
                    </span>
                  </label>

                  {diskExpandEnabled && offering.expandableDiskGb != null && (
                    <div className="flex max-w-xs items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={offering.expandableDiskGb}
                        value={extraDiskGb}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          if (Number.isNaN(next)) return
                          setExtraDiskGb(
                            Math.min(Math.max(1, next), offering.expandableDiskGb!),
                          )
                        }}
                      />
                      <span className="shrink-0 text-sm text-muted-foreground">GB</span>
                    </div>
                  )}
                </div>
              </div>

              <S3VolumeMount
                volumes={volumes}
                value={volumeId}
                onChange={setVolumeId}
              />

            </Card>
          </section>

          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-bold">镜像:</Label>
                  <EnvFeedbackLink
                    className="text-xs text-primary hover:underline sm:hidden"
                    onClick={() => setEnvFeedbackOpen(true)}
                  />
                </div>
                <EnvFeedbackLink
                  className="hidden text-sm text-primary hover:underline sm:inline-block"
                  onClick={() => setEnvFeedbackOpen(true)}
                />
              </div>

              <ImageSelector
                value={fullImageRef}
                onChange={(ref, label) => {
                  setFullImageRef(ref)
                  setImageLabel(label)
                }}
              />
            </Card>
          </section>

          <section className="mb-6">
            <Card className="gap-4 rounded-2xl p-4 ring-border/80">
              <SshAccessStep values={sshAccess} onChange={updateSshAccess} />
            </Card>
          </section>
        </div>
      </div>

      <DeployActionBar
        region={offering.region}
        gpuLabel={`${offering.gpuModelKey} ${gpuCount} 卡`}
        vcpu={offering.vcpu}
        memoryGb={offering.memoryGb}
        systemDiskGb={offering.systemDiskGb}
        dataDiskLabel={dataDiskLabel}
        priceAmount={price.amount}
        priceUnit={price.unit}
        voucherDeduction={voucherDeduction}
        voucherSummary={voucherSummary}
        payableAmount={payableAmount}
        balance={MOCK_BALANCE}
        canSubmit={canSubmit}
        submitting={submitting}
        onCancel={() => router.push("/console/server/list")}
        onSubmit={handleSubmit}
      />

      <EnvFeedbackDialog open={envFeedbackOpen} onOpenChange={setEnvFeedbackOpen} />
    </div>
  )
}
