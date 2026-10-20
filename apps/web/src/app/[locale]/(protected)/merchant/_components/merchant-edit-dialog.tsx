'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Merchant, MerchantStatus, MerchantType } from '@/lib/types/merchant'
import type { FundingMode } from '@/lib/types/merchant'
import { deriveAccessMode } from '@/lib/merchant-access-mode'
import {
  isValidMerchantUrl,
  merchantAccessModeLabels,
  merchantStatusLabels,
  merchantTypeLabels,
  normalizeMerchantUrl,
} from './merchant-utils'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
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
import { Switch } from '@workspace/ui/components/switch'

export type MerchantEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchant: Merchant
  /** 充值准入阈值（三态）与收款账户就绪状态；缺省时降级为不校验 */
  fundingSettings?: {
    rechargeBlockThreshold: number | null
    hasActiveDefaultPayoutAccount: boolean
  }
  onSave: (input: {
    name: string
    companyFullName: string
    unifiedSocialCreditCode: string
    merchantMark: string
    accessMode: Merchant['accessMode']
    /** 能力开关（D3-4=B）：编辑的是这 3 个勾选，access_mode 由其派生 */
    oemEnabled: boolean
    promoEnabled: boolean
    iframeEnabled: boolean
    type: MerchantType
    status: MerchantStatus
    remark: string
    adminUrl: string
    consoleUrl: string
    website: string
    fundingMode: FundingMode
    /** null = 继承全局；>=0 = 商户覆盖 */
    rechargeBlockThreshold: number | null
  }) => void | Promise<void>
}

export function MerchantEditDialog({
  open,
  onOpenChange,
  merchant,
  onSave,
  fundingSettings,
}: MerchantEditDialogProps) {
  const [name, setName] = useState(merchant.name)
  const [companyFullName, setCompanyFullName] = useState(merchant.companyFullName)
  const [unifiedSocialCreditCode, setUnifiedSocialCreditCode] = useState(
    merchant.unifiedSocialCreditCode,
  )
  const [merchantMark, setMerchantMark] = useState(merchant.merchantMark ?? '')
  const [oemEnabled, setOemEnabled] = useState(merchant.oemEnabled)
  const [promoEnabled, setPromoEnabled] = useState(merchant.promoEnabled)
  const [iframeEnabled, setIframeEnabled] = useState(merchant.iframeEnabled)
  const [type, setType] = useState<MerchantType>(merchant.type)
  const [status, setStatus] = useState<MerchantStatus>(merchant.status)
  const [remark, setRemark] = useState(merchant.remark ?? '')
  const [adminUrl, setAdminUrl] = useState(merchant.adminUrl ?? '')
  const [consoleUrl, setConsoleUrl] = useState(merchant.consoleUrl ?? '')
  const [website, setWebsite] = useState(merchant.website ?? '')
  const [fundingMode, setFundingMode] = useState<FundingMode>(merchant.fundingMode ?? 'prepay')
  // 三态：'' = 继承全局（提交 null），数字 = 商户覆盖
  const [threshold, setThreshold] = useState(
    fundingSettings?.rechargeBlockThreshold === null || fundingSettings?.rechargeBlockThreshold === undefined
      ? ''
      : String(fundingSettings.rechargeBlockThreshold),
  )
  const [submitting, setSubmitting] = useState(false)
  const derivedAccessMode = deriveAccessMode({ oemEnabled, promoEnabled, iframeEnabled })

  useEffect(() => {
    if (!open) return
    setName(merchant.name)
    setCompanyFullName(merchant.companyFullName)
    setUnifiedSocialCreditCode(merchant.unifiedSocialCreditCode)
    setMerchantMark(merchant.merchantMark ?? '')
    setOemEnabled(merchant.oemEnabled)
    setPromoEnabled(merchant.promoEnabled)
    setIframeEnabled(merchant.iframeEnabled)
    setType(merchant.type)
    setStatus(merchant.status)
    setRemark(merchant.remark ?? '')
    setAdminUrl(merchant.adminUrl ?? '')
    setConsoleUrl(merchant.consoleUrl ?? '')
    setWebsite(merchant.website ?? '')
    setFundingMode(merchant.fundingMode ?? 'prepay')
    setThreshold(
      fundingSettings?.rechargeBlockThreshold === null || fundingSettings?.rechargeBlockThreshold === undefined
        ? ''
        : String(fundingSettings.rechargeBlockThreshold),
    )
  }, [open, merchant, fundingSettings])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('请填写展示简称')
      return
    }
    if (!companyFullName.trim()) {
      toast.error('请填写公司全称')
      return
    }
    const uscc = unifiedSocialCreditCode.trim().toUpperCase()
    if (!/^[0-9A-Z]{18}$/.test(uscc)) {
      toast.error('统一社会信用代码须为 18 位')
      return
    }
    if (!isValidMerchantUrl(adminUrl)) {
      toast.error('管理后台地址格式不正确')
      return
    }
    if (!isValidMerchantUrl(consoleUrl)) {
      toast.error('控制台地址格式不正确')
      return
    }
    if (!isValidMerchantUrl(website)) {
      toast.error('官网地址格式不正确')
      return
    }

    // 佣金模式必须有生效默认收款账户，否则平台打款无目标。
    // 服务端同样会硬校验，这里只是提前给出可操作的提示。
    if (
      fundingMode === 'commission' &&
      merchant.fundingMode !== 'commission' &&
      fundingSettings &&
      !fundingSettings.hasActiveDefaultPayoutAccount
    ) {
      toast.error('该商户尚无已生效的默认收款账户，无法切换到佣金模式')
      return
    }

    const thresholdValue = threshold.trim() === '' ? null : Number(threshold)
    if (thresholdValue !== null && (!Number.isFinite(thresholdValue) || thresholdValue < 0)) {
      toast.error('充值准入阈值须为不小于 0 的数字，或留空以继承全局')
      return
    }

    setSubmitting(true)
    try {
      await onSave({
        name: name.trim(),
        companyFullName: companyFullName.trim(),
        unifiedSocialCreditCode: uscc,
        merchantMark: merchantMark.trim(),
        accessMode: derivedAccessMode,
        oemEnabled,
        promoEnabled,
        iframeEnabled,
        type,
        status,
        remark: remark.trim(),
        adminUrl: normalizeMerchantUrl(adminUrl) ?? '',
        consoleUrl: normalizeMerchantUrl(consoleUrl) ?? '',
        website: normalizeMerchantUrl(website) ?? '',
        fundingMode,
        rechargeBlockThreshold: thresholdValue,
      })
      toast.success('商户信息已更新')
      onOpenChange(false)
    } catch {
      toast.error('保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] min-w-[30vw] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑商户基本信息</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="merchant-name">展示简称</Label>
            <Input id="merchant-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-company">公司全称</Label>
            <Input
              id="merchant-company"
              value={companyFullName}
              onChange={(e) => setCompanyFullName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-uscc">统一社会信用代码</Label>
            <Input
              id="merchant-uscc"
              className="font-mono"
              value={unifiedSocialCreditCode}
              onChange={(e) => setUnifiedSocialCreditCode(e.target.value)}
              maxLength={18}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label>接入模式（派生）</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-input/30 px-3 text-sm">
                {merchantAccessModeLabels[derivedAccessMode]}
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={oemEnabled}
                    onCheckedChange={(v) => setOemEnabled(v === true)}
                  />
                  OEM 接入
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={iframeEnabled}
                    onCheckedChange={(v) => setIframeEnabled(v === true)}
                  />
                  iFrame 接入
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={promoEnabled}
                    onCheckedChange={(v) => setPromoEnabled(v === true)}
                  />
                  推广链接
                </label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as MerchantType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(merchantTypeLabels) as MerchantType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {merchantTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label>状态</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as MerchantStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(merchantStatusLabels) as MerchantStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {merchantStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="merchant-mark">Merchant Mark</Label>
              <Input
                id="merchant-mark"
                value={merchantMark}
                onChange={(e) => setMerchantMark(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 rounded-lg border p-4">
            <div className="text-sm font-medium">资金模式 (DEC-F1)</div>
            <p className="text-xs text-muted-foreground">
              决定商户是否需要预付资金，以及平台是否向其支付现金佣金。两个方向互斥。
            </p>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="funding-mode-prepay">预付 (OEM / iFrame)</Label>
                <p className="text-xs text-muted-foreground">
                  商户先向平台预付，用户充值消耗商户额度；平台不向商户付现
                </p>
              </div>
              <Switch
                id="funding-mode-prepay"
                checked={fundingMode === 'prepay'}
                onCheckedChange={(v) => {
                  if (v) setFundingMode('prepay')
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="funding-mode-commission">佣金 (推广链接)</Label>
                <p className="text-xs text-muted-foreground">
                  商户不预付，平台按实际消费向其支付现金佣金
                </p>
              </div>
              <Switch
                id="funding-mode-commission"
                checked={fundingMode === 'commission'}
                onCheckedChange={(v) => {
                  if (v) setFundingMode('commission')
                }}
              />
            </div>
            {fundingMode === 'commission' &&
              (fundingSettings && !fundingSettings.hasActiveDefaultPayoutAccount ? (
                <p className="text-xs text-destructive">
                  该商户尚无已生效的默认收款账户，保存将失败。请先在「收款账户审核」中通过其账户。
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  佣金模式依赖已审核通过的收款账户：平台打款只会打给 active+default 的账户。
                </p>
              ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="merchant-recharge-threshold">充值准入阈值覆盖（元）</Label>
            <Input
              id="merchant-recharge-threshold"
              type="number"
              min={0}
              step="0.01"
              placeholder="留空 = 继承全局阈值"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              该商户三池可用额合计低于此值时，其终端用户充值会被拒绝。
              留空继承全局；填 <strong>0</strong> 表示该商户永不阻断。
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="merchant-remark">备注</Label>
            <Textarea
              id="merchant-remark"
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-1">
            <div className="grid gap-2">
              <Label htmlFor="merchant-admin-url">管理后台地址</Label>
              <Input
                id="merchant-admin-url"
                type="url"
                placeholder="https://"
                value={adminUrl}
                onChange={(e) => setAdminUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="merchant-console-url">控制台地址</Label>
              <Input
                id="merchant-console-url"
                type="url"
                placeholder="https://"
                value={consoleUrl}
                onChange={(e) => setConsoleUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="merchant-website">官网地址</Label>
              <Input
                id="merchant-website"
                type="url"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            联系人请在详情页「通讯录」维护。业务 Code、平台商户 ID 由平台同步维护，此处不可编辑。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
