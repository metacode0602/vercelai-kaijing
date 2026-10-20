/**
 * 商户站内信（写侧）
 *
 * 只在平台侧（apps/web）的运营动作发生时写入，商户端（apps/merchant）只读。
 * 与 supplier 的差别是这里**没有 demo 注入**：商户看到的每一条消息都对应一次
 * 真实的平台操作，伪造通知会让商户对资金状态产生误判。
 */

import { db } from '@/lib/db'
import { merchantSiteMessage } from '@workspace/db/schema'

/** 账户充值页，商户处理预付凭证的落地位置 */
const ACCOUNT_CONSOLE_PATH = '/console/account'

function messageId(): string {
  return crypto.randomUUID()
}

export type MerchantNoticeInput = {
  merchantId: string
  category: string
  title: string
  summary: string
  content: string
  linkLabel?: string
  linkHref?: string
}

/** 落一条商户站内信。返回消息 id；调用方决定失败是否致命。 */
export async function createMerchantSiteMessage(input: MerchantNoticeInput): Promise<string> {
  const id = messageId()
  const links = input.linkHref
    ? [{ label: input.linkLabel ?? '查看详情', href: input.linkHref }]
    : []

  await db.insert(merchantSiteMessage).values({
    id,
    merchantId: input.merchantId,
    title: input.title,
    summary: input.summary,
    content: input.content,
    category: input.category,
    links,
  })

  return id
}

const CATEGORY_PREPAY = 'prepay'

/** 预付凭证审核通过 */
export async function notifyTransferProofApproved(input: {
  merchantId: string | null
  orderNo: string
  credited: number
}): Promise<void> {
  if (!input.merchantId) return

  const amount = input.credited.toFixed(2)
  await createMerchantSiteMessage({
    merchantId: input.merchantId,
    category: CATEGORY_PREPAY,
    title: '充值凭证已核销通过',
    summary: `订单 ${input.orderNo} 的到账凭证已审核通过，${amount} 元已入账到您的账户余额。`,
    content: `您好，

您的对公转账凭证已核销通过。

- 订单号：${input.orderNo}
- 入账金额：${amount} 元
- 审核结果：**通过**

款项已计入您的账户余额，可直接在控制台发起充值。

如对入账金额有疑问，请联系平台运营。`,
    linkLabel: '前往账户充值',
    linkHref: ACCOUNT_CONSOLE_PATH,
  })
}

/** 预付凭证审核驳回 */
export async function notifyTransferProofRejected(input: {
  merchantId: string | null
  orderNo: string
  comment?: string
}): Promise<void> {
  if (!input.merchantId) return

  const reason = input.comment?.trim()
  await createMerchantSiteMessage({
    merchantId: input.merchantId,
    category: CATEGORY_PREPAY,
    title: '充值凭证核销未通过',
    summary: `订单 ${input.orderNo} 的到账凭证审核未通过，请修改后重新提交。`,
    content: `您好，

您提交的对公转账凭证未能通过核销。

- 订单号：${input.orderNo}
- 审核结果：**驳回**
- 驳回原因：${reason ? reason : '（运营未填写原因）'}

常见原因包括：付款金额与订单金额不一致、银行流水信息填写有误、凭证图片不清晰。

订单仍处于待付款状态，您可重新提交凭证。`,
    linkLabel: '重新提交凭证',
    linkHref: ACCOUNT_CONSOLE_PATH,
  })
}
