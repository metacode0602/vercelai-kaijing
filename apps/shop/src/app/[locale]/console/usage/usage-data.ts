export const PRODUCT_LINE_IDS = ['containerCloud', 'serverless', 'bareMetal', 'tasks'] as const

export type ProductLineId = (typeof PRODUCT_LINE_IDS)[number]
export type UsageRange = '7d' | '30d' | 'month'
export type UsageMetric = 'cost' | 'hours'

export type ProductUsageValue = {
  cost: number
  gpuHours: number
  tasks: number
  successfulTasks: number
}

export type DailyProductUsage = {
  date: string
  values: Record<ProductLineId, ProductUsageValue>
}

export type UsageDemoData = {
  balance: number
  monthStart: string
  daily: DailyProductUsage[]
  changes: {
    spend: number
    gpuHours: number
    tasks: number
    unitCost: number
  }
}

export const PRODUCT_LINE_COLORS: Record<ProductLineId, string> = {
  containerCloud: 'var(--chart-1)',
  serverless: 'var(--chart-5)',
  bareMetal: 'var(--chart-3)',
  tasks: 'var(--chart-4)',
}

const PRODUCT_BASES: Record<
  ProductLineId,
  { gpuHours: number; cost: number; tasks: number; successRate: number; phase: number }
> = {
  containerCloud: { gpuHours: 42, cost: 310, tasks: 720, successRate: 0.992, phase: 0.4 },
  serverless: { gpuHours: 31, cost: 205, tasks: 1280, successRate: 0.996, phase: 1.7 },
  bareMetal: { gpuHours: 24, cost: 390, tasks: 180, successRate: 0.985, phase: 2.9 },
  tasks: { gpuHours: 18, cost: 165, tasks: 460, successRate: 0.989, phase: 4.2 },
}

function roundTo(value: number, precision: number) {
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function createUsageDemoData(now = new Date()): UsageDemoData {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
  )
  const daily = Array.from({ length: 30 }, (_, index) => {
    const dayOffset = 29 - index
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - dayOffset)
    const weekdayFactor = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.72 : 1
    const growthFactor = 0.9 + index * 0.006

    const values = Object.fromEntries(
      PRODUCT_LINE_IDS.map((productLineId, productIndex) => {
        const base = PRODUCT_BASES[productLineId]
        const wave = 1 + Math.sin((index + base.phase + productIndex) / 2.35) * 0.16
        const gpuHours = roundTo(base.gpuHours * weekdayFactor * growthFactor * wave, 1)
        const cost = roundTo(base.cost * weekdayFactor * growthFactor * (1 + wave * 0.04), 2)
        const tasks = Math.max(
          1,
          Math.round(base.tasks * weekdayFactor * growthFactor * (0.9 + wave * 0.1)),
        )
        const failedTasks = Math.max(
          0,
          Math.round(tasks * (1 - base.successRate) * (0.65 + (index % 5) * 0.12)),
        )

        return [
          productLineId,
          {
            cost,
            gpuHours,
            tasks,
            successfulTasks: tasks - failedTasks,
          },
        ]
      }),
    ) as Record<ProductLineId, ProductUsageValue>

    return { date: toDateKey(date), values }
  })

  return {
    balance: 8417.45,
    monthStart: toDateKey(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))),
    daily,
    changes: {
      spend: 8.4,
      gpuHours: 12.6,
      tasks: 6.8,
      unitCost: -3.2,
    },
  }
}
