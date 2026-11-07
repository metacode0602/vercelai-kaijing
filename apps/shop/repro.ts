import { createPgClient } from '@workspace/db'
import * as dashboardDa from './src/lib/server/dataaccess/dashboard'
import * as financeDa from './src/lib/server/dataaccess/finance'

const { db, pool } = createPgClient()
const org = 'zwp44no17zstc36sepceg0mr'

const tasks: Array<[string, () => Promise<unknown>]> = [
  ['navBadges', () => dashboardDa.getNavBadges(db, org)],
  ['todos', () => dashboardDa.getDashboardTodos(db, org)],
  ['trends', () => dashboardDa.getDashboardTrends(db, org, 7)],
  ['inventory', () => dashboardDa.getDashboardInventorySummary(db, org)],
  ['inventoryByCategory', () => dashboardDa.getDashboardInventoryByCategory(db, org)],
  ['alerts', () => dashboardDa.getDashboardAlerts(db, org)],
  ['finance.overview', () => financeDa.financeOverview(db, org)],
]

for (const [name, fn] of tasks) {
  try {
    const r = await fn()
    console.log(`OK ${name}`, JSON.stringify(r).slice(0, 200))
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
  }
}
await pool.end()
