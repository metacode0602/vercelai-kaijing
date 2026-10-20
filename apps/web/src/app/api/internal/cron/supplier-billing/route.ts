import { runScheduledSupplierBilling } from '@/lib/server/dataaccess/supplier/supplier-billing-scheduled'
import { getCronSecret } from '@/lib/server/dataaccess/supplier/supplier-billing-config'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const secret = getCronSecret()
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    date?: string
    month?: string
    mode?: 'daily' | 'monthly' | 'both'
  } = {}

  try {
    const text = await request.text()
    if (text.trim()) {
      body = JSON.parse(text) as typeof body
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await runScheduledSupplierBilling({
    trigger: 'manual',
    date: body.date,
    month: body.month,
    mode: body.mode ?? 'both',
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
