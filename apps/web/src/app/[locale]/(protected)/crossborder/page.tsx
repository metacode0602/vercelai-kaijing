import { CrossborderDemoAlert } from "@/components/crossborder/demo-alert"
import { MOCK_DASHBOARD } from "@/lib/crossborder/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"

const CARDS = [
  { label: "租户数", value: MOCK_DASHBOARD.tenants },
  { label: "活跃店铺", value: MOCK_DASHBOARD.activeShops },
  { label: "待审动作", value: MOCK_DASHBOARD.pendingActions },
  { label: "同步错误", value: MOCK_DASHBOARD.syncErrors },
  { label: "今日订单", value: MOCK_DASHBOARD.ordersToday },
  { label: "新选品候选", value: MOCK_DASHBOARD.candidatesNew },
]

export default function CrossborderDashboardPage() {
  return (
    <div>
      <CrossborderDemoAlert />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
