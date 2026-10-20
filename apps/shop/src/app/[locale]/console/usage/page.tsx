import { UsageDashboard } from './usage-dashboard'
import { createUsageDemoData } from './usage-data'

export default function UsagePage() {
  return <UsageDashboard data={createUsageDemoData()} />
}
