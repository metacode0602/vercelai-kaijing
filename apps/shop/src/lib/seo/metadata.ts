import type { Metadata } from 'next'
import { websiteConfig } from '@/lib/config/website'

export interface ConstructMetadataParams {
  title?: string
  description?: string
  canonicalUrl?: string
  noIndex?: boolean
}

export function constructMetadata({
  title,
  description,
  canonicalUrl,
  noIndex,
}: ConstructMetadataParams = {}): Metadata {
  return {
    title: title ?? websiteConfig.metadata.title,
    description: description ?? websiteConfig.metadata.description,
    ...(canonicalUrl && {
      alternates: { canonical: canonicalUrl },
    }),
    ...(noIndex && { robots: { index: false, follow: false } }),
  }
}
