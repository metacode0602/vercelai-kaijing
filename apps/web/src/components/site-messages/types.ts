import type { SiteMessageLink } from '@/lib/types/site-messages'

export type { SiteMessageLink }

export type SiteMessage = {
  id: string
  title: string
  summary: string
  content: string
  createdAt: string
  read: boolean
  category: string | null
  links: SiteMessageLink[]
}
