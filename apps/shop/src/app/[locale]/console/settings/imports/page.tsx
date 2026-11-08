'use client'

import * as React from 'react'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'

export default function ImportsPage() {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>待导入流水表</AlertTitle>
        <AlertDescription>
          导入批次执行与回滚待作业调度接入；模板配置见「导入模板」。
        </AlertDescription>
      </Alert>
      <UedWorkspace
        title="导入批次"
        description="暂无数据。模板配置见「导入模板」。"
        rows={[]}
        emptyText="暂无导入批次（待平台/作业接入）"
        searchKeys={['id']}
        columns={[
          { key: 'id', label: '批次' },
          { key: 'kind', label: '类型' },
          { key: 'status', label: '状态' },
        ]}
      >
        <Button size="sm" variant="outline" asChild>
          <LocaleLink href="/console/settings/import-templates">打开导入模板</LocaleLink>
        </Button>
      </UedWorkspace>
    </div>
  )
}
