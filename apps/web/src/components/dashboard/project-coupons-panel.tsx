'use client'

import { CouponsListPanel } from '@/components/dashboard/coupons-list-panel'
import type { Project } from '@/lib/data/types'

interface ProjectCouponsPanelProps {
  project: Project
}

export function ProjectCouponsPanel({ project }: ProjectCouponsPanelProps) {
  return <CouponsListPanel scope={{ kind: 'project', projectId: project.id }} />
}
