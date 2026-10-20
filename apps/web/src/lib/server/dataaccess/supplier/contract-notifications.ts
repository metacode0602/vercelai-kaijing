import { db } from '@/lib/db'
import { supplierSiteMessage, supplier } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'
import { sendEmail } from '@/lib/mail'

function newId() {
  return crypto.randomUUID()
}

interface SendContractToSupplierParams {
  contractId: string
  contractNo: string
  supplierId: string
  capacitySummary: string
  totalAmount?: string
  contractUrl: string
  senderStaffId: string | null
}

export async function sendContractToSupplier(params: SendContractToSupplierParams) {
  const [supplierRow] = await db
    .select()
    .from(supplier)
    .where(eq(supplier.id, params.supplierId))
    .limit(1)

  if (!supplierRow) throw new Error('供应商不存在')

  const adminEmail = supplierRow.contactEmail

  // Fire-and-forget email
  if (adminEmail) {
    sendEmail({
      to: adminEmail,
      template: 'contractForSupplierConfirmation',
      context: {
        supplierName: supplierRow.shortName ?? supplierRow.name,
        contractNo: params.contractNo,
        contractUrl: params.contractUrl,
        capacitySummary: params.capacitySummary,
        totalAmount: params.totalAmount,
      },
    }).catch((err) => {
      console.error('Failed to send contract confirmation email:', err)
    })
  }

  // Create in-app notification
  if (supplierRow.organizationId) {
    await db.insert(supplierSiteMessage).values({
      id: newId(),
      supplierOrgId: supplierRow.organizationId,
      title: `新合同待确认 - ${params.contractNo}`,
      summary: `平台已创建合作协议 ${params.contractNo}，包含 ${params.capacitySummary}，请确认。`,
      content: [
        `## 新合同通知`,
        ``,
        `合同编号：**${params.contractNo}**`,
        ``,
        `产能摘要：${params.capacitySummary}`,
        params.totalAmount ? `\n合同金额：${params.totalAmount}` : '',
      ``,
      `请前往合同管理页面查看并确认。`,
    ].join('\n'),
    category: 'contract',
    links: [{ label: '查看合同', href: params.contractUrl }],
  })
  }
}
