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
        backHref="/settings/erp-access"
        title={`角色 ${id}`}
        description="细粒度 ERP 角色详情待权限服务。"
      />
      <Alert>
        <AlertTitle>待权限服务</AlertTitle>
        <AlertDescription>
          角色详情待权限服务接入；RBAC 与店铺权限范围落库后即可提供可编辑的角色矩阵。
        </AlertDescription>
      </Alert>
    </div>
  )
}
