'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function AccessRoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/settings/erp-access"
        title={`角色 ${id}`}
        description="细粒度 ERP 角色详情待权限服务。"
      />
      <Alert>
        <AlertTitle>待权限服务</AlertTitle>
        <AlertDescription>
          已移除 DEMO 角色详情。下一步：RBAC / 店铺 scope 落库后再提供可编辑角色矩阵。
        </AlertDescription>
      </Alert>
    </div>
  )
}
