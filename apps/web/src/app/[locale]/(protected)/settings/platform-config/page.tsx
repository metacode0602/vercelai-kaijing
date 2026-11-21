import { PlatformConfigClient } from './platform-config-client'

export default function PlatformConfigPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">平台配置</h1>
        <p className="text-muted-foreground text-sm">
          管理平台级业务开关与租户入驻规则。
        </p>
      </div>
      <PlatformConfigClient />
    </div>
  )
}