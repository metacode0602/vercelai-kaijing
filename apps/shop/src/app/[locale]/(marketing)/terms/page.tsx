import type { Metadata } from "next"
import { constructMetadata } from "@/lib/seo/metadata"
import { LegalPage } from "../_components/legal-page"
import { getLegalDoc } from "../_lib/legal-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const doc = getLegalDoc("terms", locale)

  return constructMetadata({
    title: `${doc.title} | Open Shop`,
    description: doc.description,
  })
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const doc = getLegalDoc("terms", locale)

  return <LegalPage doc={doc} label={locale === "en" ? "Legal" : "法律条款"} />
}
