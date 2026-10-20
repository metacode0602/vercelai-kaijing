import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { organization } from '@workspace/db/schema'

type VerificationType = 'individual' | 'enterprise'

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.session.activeOrganizationId) {
      return NextResponse.json({ error: '未登录或未关联租户' }, { status: 401 })
    }

    const body = await req.json()
    const type = body.type as VerificationType

    const [org] = await db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, session.session.activeOrganizationId))
      .limit(1)

    const metadata = (org?.metadata as Record<string, unknown>) ?? {}

    if (type === 'individual') {
      const { realName, idNumber } = body
      if (!realName || realName.length < 2) {
        return NextResponse.json({ error: '请输入真实姓名' }, { status: 400 })
      }
      if (!idNumber || idNumber.length < 15) {
        return NextResponse.json({ error: '请输入有效的身份证号码' }, { status: 400 })
      }

      await db
        .update(organization)
        .set({
          metadata: {
            ...metadata,
            individualVerification: {
              realName,
              idNumber,
              status: 'pending',
              submittedAt: new Date().toISOString(),
            },
          },
        })
        .where(eq(organization.id, session.session.activeOrganizationId))

      return NextResponse.json({ success: true, status: 'pending' })
    }

    if (type === 'enterprise') {
      const { companyName, uscc } = body
      if (!companyName || companyName.length < 2) {
        return NextResponse.json({ error: '请输入企业名称' }, { status: 400 })
      }
      if (!uscc || uscc.length < 15) {
        return NextResponse.json({ error: '请输入有效的统一社会信用代码' }, { status: 400 })
      }

      await db
        .update(organization)
        .set({
          enterpriseVerificationStatus: 'pending',
          metadata: {
            ...metadata,
            enterpriseVerification: {
              companyName,
              uscc,
              submittedAt: new Date().toISOString(),
            },
          },
        })
        .where(eq(organization.id, session.session.activeOrganizationId))

      return NextResponse.json({ success: true, status: 'pending' })
    }

    return NextResponse.json({ error: '无效的认证类型' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
