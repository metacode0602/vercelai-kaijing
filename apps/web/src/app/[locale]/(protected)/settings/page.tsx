import { LocaleLink } from "@/lib/i18n/navigation"
import { Routes } from "@/lib/routes"
import { Button } from "@workspace/ui/components/button"

export default function SettingsPage() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-muted-foreground text-sm">
        跨境运营中枢：租户、入驻审核、店铺冲突、同步健康与待审动作。
      </p>
      <Button asChild>
        <LocaleLink href={Routes.Crossborder}>打开跨境运营中枢</LocaleLink>
      </Button>
    </div>
  )
}
