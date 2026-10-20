import { CrmDiscountTemplateDetailClient } from '../../_components/crm-discount-template-detail-client'

export default async function CrmDiscountTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CrmDiscountTemplateDetailClient templateId={id} />
}
